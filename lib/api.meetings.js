var _ = require('underscore');

var AuthzAPI = require('oae-authz');
var AuthzConstants = require('oae-authz/lib/constants').AuthzConstants;
var AuthzInvitations = require('oae-authz/lib/invitations');
var AuthzPermissions = require('oae-authz/lib/permissions');
var OaeUtil = require('oae-util/lib/util');
var PrincipalsUtil = require('oae-principals/lib/util');
var ResourceActions = require('oae-resource/lib/actions');
var Signature = require('oae-util/lib/signature');
var Validator = require('oae-authz/lib/validator').Validator;

var MeetingsAPI = require('oae-jitsi');
var MeetingsConstants = require('./constants').MeetingsConstants;
var MeetingsDAO = require('./internal/dao');

/**
 * PUBLIC FUNCTIONS
 */

/**
 * Create a new meeting.
 * 
 * @param {any} ctx
 * @param {any} displayName
 * @param {any} description
 * @param {any} chat
 * @param {any} contactList
 * @param {any} visibility
 * @param {any} additionalMembers
 * @param {any} callback
 * @returns
 */
var createMeeting = module.exports.createMeeting = function (ctx, displayName, description, chat, contactList, visibility, additionalMembers, callback) {

    callback = callback || function() {};

    // Setting content to default if no visibility setting is provided
    visibility = visibility || Config.getValue(ctx.tenant().alias, 'visibility', 'meeting');

    var allVisibilities = _.values(AuthzConstants.visibility);

    // Verify basic properties
    var validator = new Validator();
    validator.check(null, {'code': 401, 'msg': 'Anonymous users cannot create a meeting'}).isLoggedInUser(ctx);
    validator.check(displayName, {'code': 400, 'msg': 'Must provide a display name for the meeting'}).notEmpty();
    validator.check(displayName, {'code': 400, 'msg': 'A display name can be at most 1000 characters long'}).isShortString();
    validator.check(visibility, {'code': 400, 'msg': 'An invalid meeting visibility option has been provided. Must be one of: ' + allVisibilities.join(', ')}).isIn(allVisibilities);

    // Verify each role is valid
    _.each(additionalMembers, function (role, memberId) {
        validator.check(role, {'code': 400, 'msg': 'The role: ' + role + ' is not a valid member role for a meeting'}).isIn(MeetingsConstants.roles.ALL_PRIORITY);
    });

    if (validator.hasErrors()) return callback(validator.getFirstError());

    // The current user is always a manager
    additionalMembers[ctx.user().id] = AuthzConstants.role.MANAGER;

    var createFn = _.partial(MeetingsDAO.createMeeting, ctx.user().id, displayName, description, chat, contactList, visibility);
    ResourceActions.create(ctx, additionalMembers, createFn, function (err, meeting, memberChangeInfo) {
        if (err) return callback(err);

        MeetingsAPI.emit(MeetingsConstants.events.CREATED_MEETING, ctx, meeting, memberChangeInfo, function (errs) {
            if (errs) return callback(_.first(errs));

            return callback(null, meeting);
        });
    });

};

/**
 * Get a full meeting profile.
 * 
 * @param {any} ctx
 * @param {any} meetingId
 * @param {any} callback
 * @returns
 */
var getFullMeetingProfile = module.exports.getFullMeetingProfile = function (ctx, meetingId, callback) {

    var validator = new Validator();
    validator.check(meetingId, {'code': 400, 'msg': 'meetingId must be a valid resource id'}).isResourceId();
    if (validator.hasErrors())
	    return callback(validator.getFirstError());

    _getMeeting(meetingId, function (err, meeting) {
        if (err) return callback(err);

        // Resolve the full meeting access information for the current user
        AuthzPermissions.resolveEffectivePermissions(ctx, meeting, function (err, permissions) {
            if (err) return callback(err);
            else if (!permissions.canView) {
                // The user has no effective role, which means they are not allowed to view (this has already taken into
                // consideration implicit privacy rules, such as whether or not the meeting is public).
                return callback({'code': 401, 'msg': 'You are not authorized to view this meeting'});
            }

            meeting.isManager = permissions.canManage;
            meeting.canShare = permissions.canShare;
            meeting.canPost = permissions.canPost;

            if (ctx.user()) {
                // Attach a signature that can be used to perform quick access checks
                meeting.signature = Signature.createExpiringResourceSignature(ctx, meetingId);
            }

            // Populate the creator of the meeting
            PrincipalsUtil.getPrincipal(ctx, meeting.createdBy, function (err, creator) {
                if (err) {
                    log().warn({
                            'err': err,
                            'userId': meeting.createdBy,
                            'meetingId': meeting.id
                        }, 'An error occurred getting the creator of a meeting. Proceeding with empty user for full profile');
                }
                else
                    meeting.createdBy = creator;

                MeetingsAPI.emit(MeetingsConstants.events.GET_MEETING_PROFILE, ctx, meeting);
                return callback(null, meeting);
            });
        });
    });

};

/**
 * Get a meeting basic profile.
 * 
 * @param {any} ctx
 * @param {any} meetingId
 * @param {any} callback
 */
var getMeeting = function (ctx, meetingId, callback) {

    var validator = new Validator();
    validator.check(meetingId, {'code': 400, 'msg': 'A valid resource id must be specified'}).isResourceId();
    if (validator.hasErrors())
        return callback(validator.getFirstError());

    _getMeeting(meetingId, function (err, meeting) {
        if (err) return callback(err);

        AuthzPermissions.canView(ctx, meeting, function (err) {
            if (err) return callback(err);

            return callback(null, meeting);
        });
    });

};

/**
 * Get the invitations for a meeting.
 * 
 * @param {any} ctx
 * @param {any} meetingId
 * @param {any} callback
 * @returns
 */
var getMeetingInvitations = module.exports.getMeetingInvitations = function (ctx, meetingId, callback) {

    var validator = new Validator();
    validator.check(meetingId, {'code': 400, 'msg': 'A valid resource id must be specified'}).isResourceId();
    if (validator.hasErrors())
        return callback(validator.getFirstError());

    _getMeeting(meetingId, function (err, meeting) {
        if (err) return callback(err);

        return AuthzInvitations.getAllInvitations(ctx, meeting, callback);
    });

};

/**
 * Get the meeting members with their roles.
 * 
 * @param {any} ctx
 * @param {any} meetingId
 * @param {any} callback
 */
var getMeetingMembers = module.exports.getMeetingMembers = function (ctx, meetingId, start, limit, callback) {
    
    limit = OaeUtil.getNumberParam(limit, 10, 1);

    var validator = new Validator();
    validator.check(meetingId, {'code': 400, 'msg': 'A valid resource id must be specified'}).isResourceId();
    if (validator.hasErrors())
        return callback(validator.getFirstError());

    getMeeting(ctx, meetingId, function (err, meeting) {
        if (err) return callback(err);

        // Get the meeting members
        AuthzAPI.getAuthzMembers(meetingId, start, limit, function (err, memberRoles, nextToken) {
            if (err) return callback(err);

            // Get the basic profiles for all of these principals
            var memberIds = _.pluck(memberRoles, 'id');
            PrincipalsUtil.getPrincipals(ctx, memberIds, function (err, memberProfiles) {
                if (err) return callback(err);

                // Merge the member profiles and roles into a single object
                var memberList = _.map(memberRoles, function (memberRole) {
                    return {
                        'profile': memberProfiles[memberRole.id],
                        'role': memberRole.role
                    };
                });

                return callback(null, memberList, nextToken);
            });
        });
    });

};

/**
 * Update a meeting's metadata
 * 
 * @param {any} ctx
 * @param {any} meetingId
 * @param {any} profileFields
 * @param {any} callback
 */
var updateMeeting = module.exports.updateMeeting = function (ctx, meetingId, profileFields, callback) {

    var allVisibilities = _.values(AuthzConstants.visibility);

    var validator = new Validator();
    validator.check(meetingId, {'code': 400, 'msg': 'A valid resource id must be specified'}).isResourceId();
    validator.check(null, {'code': 401, 'msg': 'You must be authenticated to update a meeting'}).isLoggedInUser(ctx);
    validator.check(_.keys(profileFields).length, {'code': 400, 'msg': 'You should at least provide one profile field to update'}).min(1);
    _.each(profileFields, function (value, field) {
        validator.check(field, {'code': 400, 'msg': 'The field \'' + field + '\' is not a valid field. Must be one of: ' + MeetingsConstants.updateFields.join(', ')}).isIn(MeetingsConstants.updateFields);
        if (field === 'visibility')
            validator.check(value, {'code': 400, 'msg': 'An invalid visibility was specified. Must be one of: ' + allVisibilities.join(', ')}).isIn(allVisibilities);
        else if (field === 'displayName') {
            validator.check(value, {'code': 400, 'msg': 'A display name cannot be empty'}).notEmpty();
            validator.check(value, {'code': 400, 'msg': 'A display name can be at most 1000 characters long'}).isShortString();
        }
        else if (field === 'description') {
            validator.check(value, {'code': 400, 'msg': 'A description cannot be empty'}).notEmpty();
            validator.check(value, {'code': 400, 'msg': 'A description can only be 10000 characters long'}).isMediumString();
        }
    });

    if (validator.hasErrors())
        return callback(validator.getFirstError());

    _getMeeting(meetingId, function (err, meeting) {
        if (err) return callback(err);

        AuthzPermissions.canManage(ctx, meeting, function (err) {
            if (err) return callback(err);

            MeetingsDAO.updateMeeting(meeting, profileFields, function (err, updatedMeeting) {
                if (err) return callback(err);

                // Fill in the full profile, the user is inevitably a manager
                updateMeeting.isManager = true;
                updateMeeting.canPost = true;
                updateMeeting.canShare = true;

                MeetingsAPI.emit(MeetingsConstants.events.UPDATED_MEETING, ctx, updatedMeeting, meeting, function (errs) {
                    if (errs) return callback(_.first(errs));

                    return callback(null, updatedMeeting);
                });
            });
        });
    });

};

/**
 * Delete the specified meeting
 * 
 * @param {Context}     ctx                 Standard context object containing the current user and the current tenant
 * @param {String}      meetingId           The id of the meeting to delete
 * @param {Function}    callback            Standard callback function
 * @param {Object}      callback.err        An error that occured, if any
 */
var deleteMeeting = module.exports.deleteMeeting = function (ctx, meetingId, callback) {

    var validator = new Validator();
    validator.check(meetingId, {'code': 400, 'msg': 'A valid resource id must be specified'}).isResourceId();
    validator.check(null, {'code': 401, 'msg': 'You must be authenticated to delete a meeting'}).isLoggedInUser(ctx);

    if (validator.hasErrors())
        return callback(validator.getFirstError());
    
    _getMeeting(meetingId, function (err, meeting) {
        if (err) return callback(err);

        AuthzPermissions.canManage(ctx, meeting, function (err) {
            if (err) return callback(err);

            AuthzAPI.getAllAuthzMembers(meeting.id, function (err, members) {
                if (err) return callback(err);

                var roleChanges = {};
                var memberIds = _.pluck(members, 'id');
                _.each(memberIds, function (memberId) {
                    roleChanges[memberId] = false;
                });

                // Remove the meeting members
                AuthzAPI.updateRoles(meeting.id, roleChanges, function (err) {
                    if (err) return callback(err);

                    // Delete the meeting itself
                    MeetingsDAO.deleteMeeting(meeting.id, function (err) {
                        if (err) return callback(err);

                        MeetingsAPI.emit(MeetingsConstants.events.DELETED_MEETING, ctx, meeting, memberIds, function (errs) {
                            if (errs) return callback(_.first(errs));

                            return callback();
                        });
                    });
                });
            });
        });
    });

};

/**
 * Update the members of a meeting
 *
 * @param  {Context}    ctx                     Standard context object containing the current user and the current tenant
 * @param  {String}     meetingId               The id of the meeting to share
 * @param  {Object}     changes                 An object that describes the permission changes to apply to the meeting. The key is the id of the principal to which to apply the change, and the value is the role to apply to the principal. If the value is `false`, the principal will be revoked access.
 * @param  {Function}   callback                Standard callback function
 * @param  {Object}     callback.err            An error that occurred, if any
 */
var setMeetingMembers = module.exports.setMeetingMembers = function (ctx, meetingId, changes, callback) {

    var validator = new Validator();
    validator.check(meetingId, {'code': 400, 'msg': 'A valid resource id must be specified'}).isResourceId();
    validator.check(null, {'code': 401, 'msg': 'You must be authenticated to update meeting members'}).isLoggedInUser(ctx);
    _.each(changes, function (role, principalId) {
        validator.check(role, {'code': 400, 'msg': 'The role change : ' + role + ' is not a valid value. Must either be a string, or false'}).isValidRoleChange();
        if (role)
            validator.check(role, {'code': 400, 'msg': 'The role "' + role + '" is not a valid value. Must be one of : ' + MeetingsConstants.roles.ALL_PRIORITY.join(', ') + ', or false'}).isIn(MeetingsConstants.roles.ALL_PRIORITY);
    });

    if (validator.hasErrors())
        return callback(validator.getFirstError());

    _getMeeting(meetingId, function (err, meeting) {
        if (err) return callback(err);

        ResourceActions.setRoles(ctx, meeting, changes, function (err, memberChangeInfo) {
            if (err) return callback(err);

            MeetingsAPI.emit(MeetingsConstants.events.UPDATED_MEETING_MEMBERS, ctx, meeting, memberChangeInfo, {}, function (errs) {
                if (errs) return callback(_.first(errs));

                return callback();
            });
        });
    });

};

/**
 * PRIVATE FUNCTIONS
 */

/**
 * Get the meeting with the specified id.
 * 
 * @param {any} meetingId
 * @param {any} callback
 */
var _getMeeting = function (meetingId, callback) {

    MeetingsDAO.getMeeting(meetingId, function (err, meeting) {
        if (err) 
            return callback(err);
        else if (!meeting)
            return callback({'code': 404, 'msg': 'Could not find meeting : ' + meetingId});

        return callback(null, meeting);
    });

};