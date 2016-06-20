var _ = require('underscore');

var log = require('oae-logger').logger('oae-jitsi-rest');
var OAE = require('oae-util/lib/oae');
var OaeUtil = require('oae-util/lib/util');

var MeetingsAPI = require('oae-jitsi');

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