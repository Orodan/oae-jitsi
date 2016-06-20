var _ = require('underscore');

var AuthzConstants = require('oae-authz/lib/constants').AuthzConstants;
var ResourceActions = require('oae-resource/lib/actions');

var MeetingsAPI = require('oae-jitsi');
var MeetingsConstants = require('./constants').MeetingsConstants;
var MeetingsDAO = require('./internal/dao');

var createMeeting = module.exports.createMeeting = function (ctx, displayName, description, chat, contactList, visibility, additionalMembers, callback) {

    callback = callback || function() {};

    // Setting content to default if no visibility setting is provided
    visibility = visibility || Config.getValue(ctx.tenant().alias, 'visibility', 'meeting');

    // Verify properties

    // Verify each role is valid

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