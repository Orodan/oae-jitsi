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