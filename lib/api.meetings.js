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
    validator.check(meetingId, {'code': 400, 'msg': 'meetingId must be a valid resource id'}).isResourceId();
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
    validator.check(meetingId, {'code': 400, 'msg': 'A meeting id must be provided'}).isResourceId();
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