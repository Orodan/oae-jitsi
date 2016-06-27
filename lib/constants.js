var MeetingsConstants = module.exports.MeetingsConstants = {};

MeetingsConstants.roles = {
    // Determines not only all known roles, but the ordered priority they take as the "effective" role. (e.g., if
    // you are both a member and a manager, your effective role is "manager", so it must be later in the list)
    'ALL_PRIORITY': ['member', 'manager'],

    'MANAGER': 'manager',
    'MEMBER': 'member'
};

MeetingsConstants.events = {
    'CREATED_MEETING': 'createdMeeting',
    'GET_MEETING_PROFILE': 'getMeetingProfile',
    'UPDATED_MEETING': 'updatedMeeting',
    'DELETED_MEETING': 'deletedMeeting',
    'UPDATED_MEETING_MEMBERS': 'updatedMeetingMembers'
};

MeetingsConstants.activity = {
    'ACTIVITY_MEETING_CREATE': 'meeting-jitsi-create'
};

MeetingsConstants.updateFields = [
    'displayName',
    'description',
    'chat',
    'contactList',
    'visibility'
];
