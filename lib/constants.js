var MeetingsConstants = module.exports.MeetingsConstants = {};

MeetingsConstants.roles = {
    // Determines not only all known roles, but the ordered priority they take as the "effective" role. (e.g., if
    // you are both a member and a manager, your effective role is "manager", so it must be later in the list)
    'ALL_PRIORITY': ['member', 'manager'],

    'MANAGER': 'manager',
    'MEMBER': 'member'
};

MeetingsConstants.events = {
    'CREATED_MEETING': 'createdMeeting'  
};