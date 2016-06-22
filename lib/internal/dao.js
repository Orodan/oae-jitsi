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
 * Update a meeting's metadata
 * 
 * @param {any} meeting
 * @param {any} profileFields
 * @param {any} callback
 */
var updateMeeting = module.exports.updateMeeting = function (meeting, profileFields, callback) {

    var storageHash = _.extend({}, profileFields);
    storageHash.lastModified = storageHash.lastModified || Date.now();
    storageHash.lastModified = storageHash.lastModified.toString();

    var query = Cassandra.constructUpsertCQL('MeetingsJitsi', 'id', meeting.id, storageHash);
    Cassandra.runQuery(query.query, query.parameters, function(err) {
        if (err) {
            console.info(err);
            return callback(err);
        }

        return callback(null, _createUpdatedMeetingFromStorageHash(meeting, storageHash));
    });

};

/**
 * Delete a meeting
 * This does not remove the meeting from its members's libraries.
 * 
 * @param {String}      meetingId           The id of the meeting to delete
 * @param {Function}    callback            Standard callback function
 * @param {Object}      callback.err        An error that occured, if any
 */
var deleteMeeting = module.exports.deleteMeeting = function (meetingId, callback) {

    Cassandra.runQuery('DELETE FROM "MeetingsJitsi" WHERE id = ?', [meetingId], callback);

};

/**
 * PRIVATE FUNCTIONS
 */

/**
 * Generate a new unique meeting id
 * 
 * @param {any} tenantAlias
 * @returns
 */
var _createMeetingId = function (tenantAlias) {
    return AuthzUtil.toId('d', tenantAlias, ShortId.generate());
};


/**
 * Create a meeting model object from its id and the storage hash
 * 
 * @param {any} meetingId
 * @param {any} hash
 * @returns
 */
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

/**
 * Create an updated meeting object from the provided one, with updates from the provided storage hash
 * 
 * @param {any} meeting
 * @param {any} hash
 * @returns
 */
var _createUpdatedMeetingFromStorageHash = function (meeting, hash) {
    return new Meeting(
        meeting.tenant,
        meeting.id,
        meeting.createdBy,
        hash.displayName || meeting.displayName,
        hash.description || meeting.description,
        hash.chat || meeting.chat,
        hash.contactList || meeting.contactList,
        hash.visibility || meeting.visibility,
        OaeUtil.getNumberParam(meeting.created),
        OaeUtil.getNumberParam(hash.lastModified || meeting.lastModified)
    );  
};