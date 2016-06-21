var _ = require('underscore');

var PrincipalsUtil = require('oae-principals/lib/util');
var ResourceActions = require('oae-resource/lib/actions');
var AuthzConstants = require('oae-authz/lib/constants').AuthzConstants;
var Validator = require('oae-authz/lib/validator').Validator;

var MeetingsAPI = require('oae-jitsi');
var MeetingsConstants = require('./constants').MeetingsConstants;
var MeetingsDAO = require('./internal/dao');

/**
 * PUBLIC FUNCTIONS
 */

/**
 * Create a new meeting.
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
 */
var getFullMeetingProfile = module.exports.getFullMeetingProfile = function (ctx, meetingId, callback) {

    var validator = new Validator();
    validator.check(meetingId, {'code': 400, 'msg': 'meetingId must be a valid resource id'}).isResourceId();
    if (validator.hasErrors())
	    return callback(validator.getFirstError());

    _getMeeting(meetingId, function (err, meeting) {
        if (err) return callback(err);

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
    })

};

/**
 * PRIVATE FUNCTIONS
 */

/**
 * Get the meeting with the specified id.
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