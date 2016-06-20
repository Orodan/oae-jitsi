var _ = require('underscore');
var ShortId = require('shortid');

var AuthzUtil = require('oae-authz/lib/util');
var OaeUtil = require('oae-util/lib/util');
var Cassandra = require('oae-util/lib/cassandra');
var TenantsAPI = require('oae-tenants');

var Meeting = require('oae-jitsi/lib/model').Meeting;

/** 
 * PUBLIC FUNCTIONS 
 */

/**
 * Create a new meeting.
 */
var createMeeting = module.exports.createMeeting = function (createdBy, displayName, description, chat, contactList, visibility, callback) {

    var created = Date.now();
    created = created.toString();

    var tenantAlias = AuthzUtil.getPrincipalFromId(createdBy).tenantAlias;
    var meetingId = _createMeetingId(tenantAlias);
    var storageHash = {
        'tenantAlias': tenantAlias,
        'createdBy': createdBy,
        'displayName': displayName,
        'description': description,
        'chat': chat,
        'contactList': contactList,
        'visibility': visibility,
        'created': created,
        'lastModified': created
    };

    var query = Cassandra.constructUpsertCQL('MeetingsJitsi', 'id', meetingId, storageHash);
    Cassandra.runQuery(query.query, query.parameters, function (err) {
        if (err) return callback(err);

        return callback(null, _storageHashToMeeting(meetingId, storageHash));
    });

};

/**
 * Get a meeting data.
 */
var getMeeting = module.exports.getMeeting = function (meetingId, callback) {
    getMeetingsById([meetingId], function (err, meetings) {
        if (err) return callback(err);

        return callback(null, meetings[0]);
    });
};

var getMeetingsById = module.exports.getMeetingsById = function (meetingIds, callback) {

    if (_.isEmpty(meetingIds)) return callback(null, []);

    var query = 'SELECT * FROM "MeetingsJitsi" WHERE "id" in (?)';
    // Create a copy of the meetingIds array, otherwise the runQuery function will empty it
    var parameters = [];
    parameters.push(meetingIds);

    Cassandra.runQuery(query, parameters, function (err, rows) {
        if (err) return callback(err);

        // Convert the retrieved storage hashes into the Meeting model
        var meetings = {};
        _.chain(rows)
            .map(Cassandra.rowToHash)
            .each(function (row) {
                meetings[row.id] = _storageHashToMeeting(row.id, row);
            });

        // Order the meetings according to the array of meetings ids
        var orderedMeetings = _.map(meetingIds, function (meetingId) {
            return meetings[meetingId];
        });

        return callback(null, orderedMeetings);
    });

};

/**
 * PRIVATE FUNCTIONS
 */

/**
 * Generate a new unique meeting id
 */
var _createMeetingId = function (tenantAlias) {
    return AuthzUtil.toId('d', tenantAlias, ShortId.generate());
};

var _storageHashToMeeting = function (meetingId, hash) {
    return new Meeting(
        TenantsAPI.getTenant(hash.tenantAlias),
        meetingId,
        hash.createdBy,
        hash.displayName,
        hash.description,
        hash.chat,
        hash.contactList,
        hash.visibility,
        OaeUtil.getNumberParam(hash.created),
        OaeUtil.getNumberParam(hash.lastModified)
    );
};