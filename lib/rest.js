var _ = require('underscore');

var log = require('oae-logger').logger('oae-jitsi-rest');
var OAE = require('oae-util/lib/oae');
var OaeUtil = require('oae-util/lib/util');

var MeetingsAPI = require('oae-jitsi');

/**
 * Create a new meeting.
 */
OAE.tenantRouter.on('post', '/api/meetingJitsi/create', function (req, res) {

    // Ensure proper arrays for the multi-value parameters
    req.body.managers = OaeUtil.toArray(req.body.managers);
    req.body.viewers = OaeUtil.toArray(req.body.viewers);

    // Construct a hash for additional members that maps each user to their role
    var additionalMembers = {};
    _.each(req.body.managers, function(userId) {
        additionalMembers[userId] = AuthzConstants.role.MANAGER;
    });
    _.each(req.body.viewers, function(userId) {
        additionalMembers[userId] = AuthzConstants.role.VIEWER;
    });

    MeetingsAPI.Meetings.createMeeting(req.ctx, req.body.displayName, req.body.description, req.body.chat, req.body.contactList, req.body.visibility, additionalMembers, function (err, meeting) {
        if (err) return res.send(err.code, err.msg);
        return res.send(201, meeting);
    });

});

/**
 * Get a meeting data.
 */
OAE.tenantRouter.on('get', '/api/meeting-jitsi/:meetingId', function (req, res) {

    MeetingsAPI.Meetings.getFullMeetingProfile(req.ctx, req.params.meetingId, function (err, meeting) {
        if (err) return res.send(err.code, err.msg);

        return res.send(200, meeting);
    });

});

/**
 * Get a meeting invitations.
 */
OAE.tenantRouter.on('get', '/api/meeting-jitsi/:meetingId/invitations', function (req, res) {

    MeetingsAPI.Meetings.getMeetingInvitations(req.ctx, req.params.meetingId, function (err, invitations) {
        if (err) return res.send(err.code, err.msg);

        return res.send(200, {'results': invitations});
    });

});

/**
 * Get a meeting members with their roles.
 */
OAE.tenantRouter.on('get', '/api/meeting-jitsi/:meetingId/members', function (req, res) {

    var limit = OaeUtil.getNumberParam(req.query.limot, 10, 1, 25);
    MeetingsAPI.Meetings.getMeetingMembers(req.ctx, req.params.meetingId, req.query.start, limit, function (err, members, nextToken) {
        if (err) return res.send(err.code, err.msg);

        return res.send(200, {'results': members, 'nextToken': nextToken}); 
    });

});

/**
 * Update a meeting's metadata.
 */
OAE.tenantRouter.on('put', '/api/meeting-jitsi/:meetingId', function (req, res) {

    MeetingsAPI.Meetings.updateMeeting(req.ctx, req.params.meetingId, req.body, function (err, meeting) {
        if (err) return res.send(err.code, ett.msg);

        return res.send(200, meeting);
    });

});

/**
 * @REST deleteMeetingMeetingId
 *
 * Delete a meeting
 *
 * @Server      tenant
 * @Method      DELETE
 * @Path        /meeting/{meetingId}
 * @PathParam   {string}        meetingId           The id of the meeting to delete
 * @HttpResponse                200                 Meeting deleted
 * @HttpResponse                400                 A valid meeting id must be provided
 * @HttpResponse                401                 You are not authorized to delete this meeting
 * @HttpResponse                404                 Could not find the specified meeting
 */
OAE.tenantRouter.on('delete', '/api/meeting-jitsi/:meetingId', function (req, res) {

    MeetingsAPI.Meetings.deleteMeeting(req.ctx, req.params.meetingId, function (err) {
        if (err) return res.send(err.code, err.msg);

        return res.send(200);
    });

});

/**
 * @REST postMeetingMeetingIdMembers
 *
 * Update the members of a meeting
 *
 * @Server      tenant
 * @Method      PUT
 * @Path        /meeting/{meetingId}/members
 * @PathParam   {string}                    meetingId           The id of the meeting to update the members for
 * @BodyParam   {MeetingMembersUpdate}      body                Object that describes the membership updates to apply to the meeting
 * @Return      {void}
 * @HttpResponse                            200                 Meeting members updated
 * @HttpResponse                            400                 A valid meeting id must be provided
 * @HttpResponse                            400                 Invalid principal id specified
 * @HttpResponse                            400                 Must specify at least one permission change to apply
 * @HttpResponse                            400                 One or more target members being granted access are not authorized to become members on this meeting
 * @HttpResponse                            400                 The requested change results in a meeting with no managers
 * @HttpResponse                            400                 An invalid role value was specified. Must either be a string, or false
 * @HttpResponse                            400                 You must specify at least one permission change
 * @HttpResponse                            401                 You are not authorized to update the permissions of this meeting
 * @HttpResponse                            404                 Could not find the specified meeting
 */
OAE.tenantRouter.on('put', '/api/meeting-jitsi/:meetingId/members', function (req, res) {

    // Parse the incoming false values
    var permissionUpdates = {};
    _.each(req.body, function (value, key) {
        permissionUpdates[key] = OaeUtil.castToBoolean(value);
    });

    MeetingsAPI.Meetings.setMeetingMembers(req.ctx, req.params.meetingId, permissionUpdates, function (err) {
        if (err) return res.send(err.code, err.msg);

        return res.send(200);
    });

});