/*!
 * Copyright 2016 Apereo Foundation (AF) Licensed under the
 * Educational Community License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may
 * obtain a copy of the License at
 *
 *     http://opensource.org/licenses/ECL-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS"
 * BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

var _ = require('underscore');

var ActivityAPI = require('oae-activity');
var ActivityConstants = require('oae-activity/lib/constants').ActivityConstants;
var ActivityModel = require('oae-activity/lib/model');
var ActivityUtil = require('oae-activity/lib/util');
var AuthzAPI = require('oae-authz');
var AuthzConstants = require('oae-authz/lib/constants').AuthzConstants;
var AuthzUtil = require('oae-authz/lib/util');
var Context = require('oae-context').Context;
var log = require('oae-logger').logger('oae-jitsi');
var MessageBoxAPI = require('oae-messagebox');
var MessageBoxUtil = require('oae-messagebox/lib/util');
var PrincipalsDAO = require('oae-principals/lib/internal/dao');
var PrincipalsUtil = require('oae-principals/lib/util');
var Tenant = require('oae-tenants/lib/model').Tenant;
var TenantsAPI = require('oae-tenants');
var TenantsUtil = require('oae-tenants/lib/util');
var User = require('oae-principals/lib/model').User;
var util = require('util');

var MeetingsAPI = require('./api');
var MeetingsConstants = require('./constants').MeetingsConstants;
var MeetingsDAO = require('./internal/dao');

////////////////////
// MEETING-CREATE //
////////////////////

ActivityAPI.registerActivityType(MeetingsConstants.activity.ACTIVITY_MEETING_CREATE, {
    'groupBy': [{'actor': true}],
    'streams': {
        'activity': {
            'router': {
                'actor': ['self', 'followers'],
                'object': ['self', 'members']
            }
        },
        'notification': {
            'router': {
                'object': ['members']
            }
        },
        'email': {
            'router': {
                'object': ['members']
            }
        }
    }
});

/*!
 * Post a meeting-create activity when a user creates a meeting.
 */
MeetingsAPI.on(MeetingsConstants.events.CREATED_MEETING, function(ctx, meeting, memberChangeInfo) {

    var millis = Date.now();
    var actorResource = new ActivityModel.ActivitySeedResource('user', ctx.user().id, {'user': ctx.user()});
    var objectResource = new ActivityModel.ActivitySeedResource('meeting-jitsi', meeting.id, {'meeting-jitsi': meeting});
    var targetResource = null;

    // Get the extra members
    var extraMembers = _.chain(memberChangeInfo.changes)
        .keys()
        .filter(function (member) {
            return (member !== ctx.user().id);
        })
        .value();

    // If we only added 1 extra user or group, we set the target to that entity
    if (extraMembers.length === 1) {
        var extraMember = _.first(extraMembers);
        var targetResourceType = (PrincipalsUtil.isGroup(extraMember)) ? 'group' : 'user';
        targetResource = new ActivityModel.ActivitySeedResource(targetResourceType, extraMember);
    }

    // Generate the activity seed and post it to the queue
    var activitySeed = new ActivityModel.ActivitySeed(MeetingsConstants.activity.ACTIVITY_MEETING_CREATE, millis, ActivityConstants.verbs.CREATE, actorResource, objectResource, targetResource);
    ActivityAPI.postActivity(ctx, activitySeed);

});

//////////////////////////////////////////////////////////////////////////
// MEETING-SHARE, MEETING-ADD-TO-LIBRARY and MEETING-UPDATE-MEMBER-ROLE //
//////////////////////////////////////////////////////////////////////////

ActivityAPI.registerActivityType(MeetingsConstants.activity.ACTIVITY_MEETING_SHARE, {
    'groupBy': [
        // "Branden Visser shared Content Item with 5 users and groups"
        {'actor': true, 'object': true},

        // "Branden Visser shared 8 files with OAE Team"
        {'actor': true, 'target': true}
    ],
    'streams': {
        'activity': {
            'router': {
                'actor': ['self'],
                'object': ['managers'],
                'target': ['self', 'members', 'followers']
            }
        },
        'notification': {
            'router': {
                'target': ['self']
            }
        },
        'email': {
            'router': {
                'target': ['self']
            }
        }
    }
});

ActivityAPI.registerActivityType(MeetingsConstants.activity.ACTIVITY_MEETING_UPDATE_MEMBER_ROLE, {
    'groupBy': [{'actor': true, 'target': true}],
    'streams': {
        'activity': {
            'router': {
                'actor': ['self'],
                'object': ['self', 'members'],
                'target': ['managers']
            }
        }
    }
});

ActivityAPI.registerActivityType(MeetingsConstants.activity.ACTIVITY_MEETING_ADD_TO_LIBRARY, {
    // "Branden Visser added 5 items to his library"
    'groupBy': [{'actor': true}],
    'streams': {
        'activity': {
            'router': {
                'actor': ['self', 'followers'],
                'object': ['managers']
            }
        }
    }
});

/**
 * Post a meeting-share, meeting-add-to-library or meeting-update-member role activity based on meeting sharing
 */
MeetingsAPI.on(MeetingsConstants.events.UPDATED_MEETING_MEMBERS, function (ctx, meeting, memberChangeInfo, opts) {

    if (opts.invitation) {
        // If this member update came from an invitation, we bypass adding activity as there is a
        // dedicated activity for that
        return;
    }

    var addedPrincipalIds = _.pluck(memberChangeInfo.members.added, 'id');
    var updatedPrincipalIds = _.pluck(memberChangeInfo.members.updated, 'id');

    var millis = Date.now();
    var actorResource = new ActivityModel.ActivitySeedResource('user', ctx.user().id, {'user': ctx.user()});
    var meetingResource = new ActivityModel.ActivitySeedResource('meeting-jitsi', meeting.id, {'meeting-jitsi': meeting});
    // For users that are newly added to the meeting, post either a share or "add to library" activity, depending on context
    _.each(addedPrincipalIds, function(principalId) {
        if (principalId === ctx.user().id) {
            // Users can't "share" with themselves, they actually "add it to their library"
            ActivityAPI.postActivity(ctx, new ActivityModel.ActivitySeed(MeetingsConstants.activity.ACTIVITY_MEETING_ADD_TO_LIBRARY, millis, ActivityConstants.verbs.ADD, actorResource, meetingResource));
        } else {
            // A user shared meeting with some other user, fire the meeting share activity
            var principalResourceType = (PrincipalsUtil.isGroup(principalId)) ? 'group' : 'user';
            var principalResource = new ActivityModel.ActivitySeedResource(principalResourceType, principalId);
            ActivityAPI.postActivity(ctx, new ActivityModel.ActivitySeed(MeetingsConstants.activity.ACTIVITY_MEETING_SHARE, millis, ActivityConstants.verbs.SHARE, actorResource, meetingResource, principalResource));
        }
    });

    // For users whose role changed, post the meeting-update-member-role activity
    _.each(updatedPrincipalIds, function(principalId) {
        var principalResourceType = (PrincipalsUtil.isGroup(principalId)) ? 'group' : 'user';
        var principalResource = new ActivityModel.ActivitySeedResource(principalResourceType, principalId);
        ActivityAPI.postActivity(ctx, new ActivityModel.ActivitySeed(MeetingsConstants.activity.ACTIVITY_MEETING_UPDATE_MEMBER_ROLE, millis, ActivityConstants.verbs.UPDATE, actorResource, principalResource, meetingResource));
    });
});

//////////////////////////////////////////////////
// MEETING-UPDATE and MEETING-UPDATE-VISIBILITY //
//////////////////////////////////////////////////

ActivityAPI.registerActivityType(MeetingsConstants.activity.ACTIVITY_MEETING_UPDATE, {
    'streams': {
        'activity': {
            'router': {
                'actor': ['self'],
                'object': ['self', 'members']
            }
        },
        'notification': {
            'router': {
                'object': ['managers']
            }
        },
        'email': {
            'router': {
                'object': ['managers']
            }
        }
    }
});

ActivityAPI.registerActivityType(MeetingsConstants.activity.ACTIVITY_MEETING_UPDATE_VISIBILITY, {
    'streams': {
        'activity': {
            'router': {
                'actor': ['self'],
                'object': ['self', 'members']
            }
        },
        'notification': {
            'router': {
                'object': ['managers']
            }
        }
    }
});

/**
 * Post either a meeting-update or meeting-update-visibility activity when an user updates a meeting's metadata
 */
MeetingsAPI.on(MeetingsConstants.events.UPDATED_MEETING, function (ctx, newMeeting, oldMeeting) {

    var millis = Date.now();
    var actorResource = new ActivityModel.ActivitySeedResource('user', ctx.user().id, {'user': ctx.user()});
    var objectResource = new ActivityModel.ActivitySeedResource('meeting-jitsi', newMeeting.id, {'meeting-jitsi': newMeeting});

    // We discriminate between general updates and visibility changes.
    // If the visibility has changed, we fire a visibility changed activity *instead* of an update activity
    var activityType = null;
    if (newMeeting.visibility === oldMeeting.visibility) {
        activityType = MeetingsConstants.activity.ACTIVITY_MEETING_UPDATE;
    } else {
        activityType = MeetingsConstants.activity.ACTIVITY_MEETING_UPDATE_VISIBILITY;
    }

    var activitySeed = new ActivityModel.ActivitySeed(activityType, millis, ActivityConstants.verbs.UPDATE, actorResource, objectResource);
    ActivityAPI.postActivity(ctx, activitySeed);

});

/////////////////////
// MEETING-MESSAGE //
/////////////////////

ActivityAPI.registerActivityType(MeetingsConstants.activity.ACTIVITY_MEETING_MESSAGE, {
    'groupBy': [{'target': true}],
    'streams': {
        'activity': {
            'router': {
                'actor': ['self'],
                'target': ['message-contributors', 'members']
            }
        },
        'notification': {
            'router': {
                'target': ['message-contributors', 'members']
            }
        },
        'email': {
            'router': {
                'target': ['message-contributors', 'members']
            }
        },
        'message': {
            'transient': true,
            'router': {

                // Route the activity to the meeting
                'target': ['self']
            }
        }
    }
});

/**
 * Post a meeting-jitsi-message activity when an user comments on a meeting
 */
MeetingsAPI.on(MeetingsConstants.events.CREATED_MEETING_MESSAGE, function (ctx, message, meeting) {

    var millis = Date.now();
    var actorResource = new ActivityModel.ActivitySeedResource('user', ctx.user().id, {'user': ctx.user()});
    var objectResource = new ActivityModel.ActivitySeedResource('meeting-jitsi-message', message.id, {'meetingId': meeting.id, 'message': message});
    var targetResource = new ActivityModel.ActivitySeedResource('meeting-jitsi', meeting.id, {'meeting-jitsi': meeting});
    var activitySeed = new ActivityModel.ActivitySeed(MeetingsConstants.activity.ACTIVITY_MEETING_MESSAGE, millis, ActivityConstants.verbs.POST, actorResource, objectResource, targetResource);

    ActivityAPI.postActivity(ctx, activitySeed);

});

///////////////////////////
// ACTIVITY ENTITY TYPES //
///////////////////////////

/*
 * Produces a persistent 'meeting' activity entity
 * @see ActivityAPI#registerActivityEntityType
 */
var _meetingProducer = function(resource, callback) {

    var meeting = (resource.resourceData && resource.resourceData['meeting-jitsi']) ? resource.resourceData['meeting-jitsi'] : null;

    // If the meeting item was fired with the resource, use it instead of fetching
    if (meeting) {
        return callback(null, _createPersistentMeetingActivityEntity(meeting));
    }

    MeetingsDAO.getMeeting(resource.resourceId, function(err, meeting) {
        if (err) { 
            return callback(err);
        }

        return callback(null, _createPersistentMeetingActivityEntity(meeting));
    });

};

/*
 * Produces an persistent activity entity that represents a message that was posted
 * @see ActivityAPI#registerActivityEntityType
 */
var _meetingMessageProducer = function(resource, callback) {
    var meetingId = resource.resourceData.meetingId;
    var message = resource.resourceData.message;
    MeetingsDAO.getMeeting(meetingId, function(err, meeting) {
        if (err) {
            return callback(err);
        }

        MessageBoxUtil.createPersistentMessageActivityEntity(message, function(err, entity) {
            if (err) {
                return callback(err);
            }

            // Store the meeting id and visibility on the entity as these are required for routing the activities
            entity.objectType = 'meeting-jitsi-message';
            entity.meetingId = meeting.id;
            entity.meetingVisibility = meeting.visibility;
            return callback(null, entity);
        });
    });
};

/**
 * Create the persistent meeting entity that can be transformed into an activity entity for the UI.
 *
 * @param  {Meeting}     meeting      The meeting that provides the data for the entity.
 * @return {Object}                         An object containing the entity data that can be transformed into a UI meeting activity entity
 * @api private
 */
var _createPersistentMeetingActivityEntity = function(meeting) {
    return new ActivityModel.ActivityEntity('meeting-jitsi', meeting.id, meeting.visibility, {'meeting-jitsi': meeting});
};

/*
 * Transform the meeting persistent activity entities into UI-friendly ones
 * @see ActivityAPI#registerActivityEntityType
 */
var _meetingTransformer = function(ctx, activityEntities, callback) {

    var transformedActivityEntities = {};
    var allRevisionIds = [];

    _.each(activityEntities, function(entities, activityId) {
        transformedActivityEntities[activityId] = transformedActivityEntities[activityId] || {};

        _.each(entities, function(entity, entityId) {
            // Transform the persistent entity into an ActivityStrea.ms compliant format
            transformedActivityEntities[activityId][entityId] = _transformPersistentMeetingActivityEntity(ctx, entity);
        });
    });

    return callback(null, transformedActivityEntities);

};

/*
 * Transform the persisted message activity entities into UI-friendly ones
 * @see ActivityAPI#registerActivityEntityType
 */
var _meetingMessageTransformer = function(ctx, activityEntities, callback) {
    var transformedActivityEntities = {};
    _.keys(activityEntities).forEach(function(activityId) {
        transformedActivityEntities[activityId] = transformedActivityEntities[activityId] || {};
        _.keys(activityEntities[activityId]).forEach(function(entityId) {
            var entity = activityEntities[activityId][entityId];
            var meetingId = entity.meetingId;
            var resource = AuthzUtil.getResourceFromId(meetingId);
            var profilePath = util.format('/meeting-jitsi/%s/%s', resource.tenanAlias, resource.resourceId);
            var urlFormat = '/api/meeting-jitsi/' + meetingId + '/messages/%s';
            transformedActivityEntities[activityId][entityId] = MessageBoxUtil.transformPersistentMessageActivityEntity(ctx, entity, profilePath, urlFormat);
        });
    });
    return callback(null, transformedActivityEntities);
};

/*!
 * Transform the meeting persistent activity entities into their OAE profiles
 * @see ActivityAPI#registerActivityEntityType
 */
var _meetingInternalTransformer = function(ctx, activityEntities, callback) {

    var transformedActivityEntities = {};
    var allRevisionIds = [];

    _.each(activityEntities, function(entities, activityId) {
        transformedActivityEntities[activityId] = transformedActivityEntities[activityId] || {};

        _.each(entities, function(entity, entityId) {
            // Transform the persistent entity into the OAE model
            transformedActivityEntities[activityId][entityId] = entity['meeting-jitsi'];
        });
    });

    return callback(null, transformedActivityEntities);
};

/*
 * Transform the persisted message activity entities into UI-friendly ones
 * @see ActivityAPI#registerActivityEntityType
 */
var _meetingMessageInternalTransformer = function(ctx, activityEntities, callback) {
    var transformedActivityEntities = {};
    _.keys(activityEntities).forEach(function(activityId) {
        transformedActivityEntities[activityId] = transformedActivityEntities[activityId] || {};
        _.keys(activityEntities[activityId]).forEach(function(entityId) {
            var entity = activityEntities[activityId][entityId];
            transformedActivityEntities[activityId][entityId] =  MessageBoxUtil.transformPersistentMessageActivityEntityToInternal(ctx, entity.message);
        });
    });
    return callback(null, transformedActivityEntities);
};

/**
 * Transform a meeting object into an activity entity suitable to be displayed in an activity stream.
 *
 * For more details on the transformed entity model, @see ActivityAPI#registerActivityEntityTransformer
 *
 * @param  {Context}           ctx         Standard context object containing the current user and the current tenant
 * @param  {Object}            entity      The persistent activity entity to transform
 * @return {ActivityEntity}                The activity entity that represents the given meeting item
 */
var _transformPersistentMeetingActivityEntity = function(ctx, entity) {
    var meeting = entity['meeting-jitsi'];

    // Generate URLs for this activity
    var tenant = ctx.tenant();
    var baseUrl = TenantsUtil.getBaseUrl(tenant);
    var globalId = baseUrl + '/api/meeting-jitsi/' + meeting.id;
    var resource = AuthzUtil.getResourceFromId(meeting.id);
    var profileUrl = baseUrl + '/meeting-jitsi/' + resource.tenantAlias + '/' + resource.resourceId;

    var opts = {};
    opts.url = profileUrl;
    opts.displayName = meeting.displayName;
    opts.ext = {};
    opts.ext[ActivityConstants.properties.OAE_ID] = meeting.id;
    opts.ext[ActivityConstants.properties.OAE_VISIBILITY] = meeting.visibility;
    opts.ext[ActivityConstants.properties.OAE_PROFILEPATH] = meeting.profilePath;
    return new ActivityModel.ActivityEntity('meeting-jitsi', globalId, meeting.visibility, opts);

};

ActivityAPI.registerActivityEntityType('meeting-jitsi', {
    'producer': _meetingProducer,
    'transformer': {
        'activitystreams': _meetingTransformer,
        'internal': _meetingInternalTransformer
    },
    'propagation': function(associationsCtx, entity, callback) {
        ActivityUtil.getStandardResourcePropagation(entity['meeting-jitsi'].visibility, AuthzConstants.joinable.NO, callback);
    }
});

ActivityAPI.registerActivityEntityType('meeting-jitsi-message', {
    'producer': _meetingMessageProducer,
    'transformer': {
        'activitystreams': _meetingMessageTransformer,
        'internal': _meetingMessageInternalTransformer
    },
    'propagation': function (associationsCtx, entity, callback) {
        return callback(null, [{'type': ActivityConstants.entityPropagation.ALL}]);
    }
});

//////////////////////////////////
// ACTIVITY ENTITY ASSOCIATIONS //
//////////////////////////////////

/*
 * Register an association that presents the meeting
 */
ActivityAPI.registerActivityEntityAssociation('meeting-jitsi', 'self', function(associationsCtx, entity, callback) {
    return callback(null, [entity[ActivityConstants.properties.OAE_ID]]);
});

/*
 * Register an association that presents the members of a meeting categorized by role
 */
ActivityAPI.registerActivityEntityAssociation('meeting-jitsi', 'members-by-role', function(associationsCtx, entity, callback) {
    ActivityUtil.getAllAuthzMembersByRole(entity[ActivityConstants.properties.OAE_ID], callback);
});

/*
 * Register an association that presents all the indirect members of a meeting
 */
ActivityAPI.registerActivityEntityAssociation('meeting-jitsi', 'members', function(associationsCtx, entity, callback) {
    associationsCtx.get('members-by-role', function(err, membersByRole) {
        if (err) {
            return callback(err);
        }

        return callback(null, _.flatten(_.values(membersByRole)));
    });
});

/*
 * Register an association that presents all the managers of a meeting
 */
ActivityAPI.registerActivityEntityAssociation('meeting-jitsi', 'managers', function(associationsCtx, entity, callback) {
    associationsCtx.get('members-by-role', function(err, membersByRole) {
        if (err) {
            return callback(err);
        }

        return callback(null, membersByRole[MeetingsConstants.roles.MANAGER]);
    });
});

/*
 * Register an assocation that presents all the commenting contributors of a meeting
 */
ActivityAPI.registerActivityEntityAssociation('meeting-jitsi', 'message-contributors', function(associationsCtx, entity, callback) {
    MessageBoxAPI.getRecentContributions(entity[ActivityConstants.properties.OAE_ID], null, 100, callback);
});

/*!
 * Register an association that presents the meeting for a meeting-message entity
 */
ActivityAPI.registerActivityEntityAssociation('meeting-jitsi-message', 'self', function(associationsCtx, entity, callback) {
    return callback(null, [entity.meetingId]);
});

