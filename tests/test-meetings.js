var _ = require('underscore');
var assert = require('assert');

var RestAPI = require('oae-rest');
var TestsUtil = require('oae-tests');

var MeetingsDAO = require('oae-jitsi/lib/internal/dao');

describe('Meeting Jitsi', function () {

    var camAnonymousRestCtx = null;
    var camAdminRestCtx = null;

    beforeEach(function () {
        camAnonymousRestCtx = TestsUtil.createTenantRestContext(global.oaeTests.tenants.cam.host);
        camAdminRestCtx = TestsUtil.createTenantAdminRestContext(global.oaeTests.tenants.cam.host);
    });

    describe('Create meeting', function () {

        it('should create successfully the meeting with the proper model', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 3, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];
                var fifi = _.values(user)[1];
                var loulou = _.values(user)[2];

                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';
                var managers = [riri.user.id];
                var members = [fifi.user.id];

                // Stores how many meetings we currently have in db
                var numMeetingsOrig = 0;
                MeetingsDAO.iterateAll(null, 1000, function (meetingRows, done) {
                    if (meetingRows) numMeetingsOrig += meetingRows.length;

                    return done();
                }, function (err) {
                    assert.ok(!err);

                    // Create one new meeting
                    RestAPI.MeetingsJitsi.createMeeting(loulou.restContext, displayName, description, chat, contactList, visibility, managers, members, function (err, meeting) {
                        assert.ok(!err);

                        assert.equal(meeting.createdBy, loulou.user.id);
                        assert.equal(meeting.displayName, displayName);
                        assert.equal(meeting.description, description);
                        assert.equal(meeting.chat, chat);
                        assert.equal(meeting.contactList, contactList);
                        assert.equal(meeting.visibility, visibility);
                        assert.equal(meeting.resourceType, 'meeting-jitsi');

                        // Check the meeting members and their roles
                        RestAPI.MeetingsJitsi.getMembers(loulou.restContext, meeting.id, null, 1000, function (err, members) {
                            assert.ok(!err);

                            var memberIds = _.pluck(_.pluck(members.results, 'profile'), 'id');

                            assert.equal(memberIds.length, 3);
                            assert.equal(_.contains(memberIds, riri.user.id), true);
                            assert.equal(_.contains(memberIds, fifi.user.id), true);
                            assert.equal(_.contains(memberIds, loulou.user.id), true);

                            var roles = _.pluck(members.results, 'role');

                            assert.equal(roles.length, 3);
                            assert.equal(_.contains(roles, 'manager'), true);
                            assert.equal(_.contains(roles, 'member'), true);

                            // Ensure the new number of meetings in db is numMeetingsOrig + 1
                            var numMeetingAfter = 0;
                            var hasNewMeeting = false;

                            MeetingsDAO.iterateAll(null, 1000, function (meetingRows, done) {
                                if (meetingRows) {
                                    numMeetingAfter += meetingRows.length;
                                    _.each(meetingRows, function (meetingRow) {
                                        if (meetingRow.id === meeting.id) hasNewMeeting = true;
                                    });
                                }

                                return done();
                            }, function (err) {
                                assert.ok(!err);
                                assert.strictEqual(numMeetingsOrig + 1, numMeetingAfter);
                                assert.ok(hasNewMeeting);

                                return callback();
                            });
                        });
                    });
                });
            });

        });

        it('should not be successfull with an anonymous user', function (callback) {

            var displayName = 'test-create-displayName';
            var description = 'test-create-description';
            var chat = true;
            var contactList = false;
            var visibility = 'public';

            RestAPI.MeetingsJitsi.createMeeting(camAnonymousRestCtx, displayName, description, chat, contactList, visibility, null, null, function (err) {
                assert.ok(err);
                assert.equal(err.code, 401);

                return callback();
            });

        });

        it('should not be successfull with an empty display name', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];

                var displayName = null;
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err) {
                    assert.ok(err);
                    assert.equal(err.code, 400);

                    return callback();
                });
            });

        });

        it('should not be successfull with a display name longer than the maximum allowed size', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];

                var displayName = TestsUtil.generateRandomText(100);
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err) {
                    assert.ok(err);
                    assert.equal(err.code, 400);

                    return callback();
                });
            });

        });

        it('should not be successfull with a description longer than the maximum allowed size', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];

                var displayName = 'test-create-displayName';
                var description = TestsUtil.generateRandomText(1000);
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err) {
                    assert.ok(err);
                    assert.equal(err.code, 400);

                    return callback();
                });
            });

        });

        it('should not be successfull with an invalid visibility', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];

                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'not-a-visibility';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err) {
                    assert.ok(err);
                    assert.equal(err.code, 400);

                    return callback();
                });
            });

        });

        it('should not be successfull with an invalid manager id', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];

                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, ['not-an-id'], null, function (err) {
                    assert.ok(err);
                    assert.equal(err.code, 400);

                    return callback();
                });
            });

        });

        it('should not be successfull with an invalid member id', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];

                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, ['not-an-id'], function (err) {
                    assert.ok(err);
                    assert.equal(err.code, 400);

                    return callback();
                });
            });

        });

        it('should not be successfull with a private user as a member', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 2, function(err, users) {
                assert.ok(!err);

                var riri = _.values(users)[0];
                var fifi = _.values(users)[1];

                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.User.updateUser(fifi.restContext, fifi.user.id, {'visibility': 'private'}, function(err) {
                    assert.ok(!err);

                    RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, [fifi.user.id], [], function(err) {
                        assert.ok(err);
                        assert.equal(err.code, 401);
                        
                        return callback();
                    });
                });
            });

        });

        it('should not be successfull with a private group as a member', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 2, function(err, users) {
                assert.ok(!err);

                var riri = _.values(users)[0];
                var fifi = _.values(users)[1];

                RestAPI.Group.createGroup(fifi.restContext, 'Group title', 'Group description', 'private', undefined, [], [], function(err, groupObj) {
                    assert.ok(!err);

                    var displayName = 'test-create-displayName';
                    var description = 'test-create-description';
                    var chat = true;
                    var contactList = false;
                    var visibility = 'public';

                    RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, [groupObj.id], [], function(err) {
                        assert.ok(err);
                        assert.equal(err.code, 401);

                        return callback();
                    });
                });
            });

        });

    });
    
    describe('Update meeting', function () {

        it('should update successfully the meeting', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];
                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err, meeting) {
                    assert.ok(!err);

                    var updates = {
                        'displayName': 'new-display-name',
                        'description': 'new-description',
                        'chat': false,
                        'contactList': true
                    };

                    RestAPI.MeetingsJitsi.updateMeeting(riri.restContext, meeting.id, updates, function (err, meeting) {
                        assert.ok(!err);
                        assert.equal(meeting.displayName, updates.displayName);
                        assert.equal(meeting.description, updates.description);
                        
                        return callback();
                    });
                });
            });

        });

        it('should not be successfull with an empty display name', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];
                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err, meeting) {
                    assert.ok(!err);

                    var updates = {
                        'displayName': '',
                        'description': 'new-description'
                    };

                    RestAPI.MeetingsJitsi.updateMeeting(riri.restContext, meeting.id, updates, function (err, meeting) {
                        assert.ok(err);
                        assert.equal(err.code, 400);
                        
                        return callback();
                    });
                });
            });

        });

        it('should not be successfull with a display name longer than the maximum allowed size', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];
                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err, meeting) {
                    assert.ok(!err);

                    var updates = {
                        'displayName': TestsUtil.generateRandomText(100),
                        'description': 'new-description'
                    };

                    RestAPI.MeetingsJitsi.updateMeeting(riri.restContext, meeting.id, updates, function (err, meeting) {
                        assert.ok(err);
                        assert.equal(err.code, 400);
                        
                        return callback();
                    });
                });
            });

        });

        it('should not be successfull with a description longer than the maximum allowed size', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];
                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err, meeting) {
                    assert.ok(!err);

                    var updates = {
                        'displayName': 'new-display-name',
                        'description': TestsUtil.generateRandomText(1000)
                    };

                    RestAPI.MeetingsJitsi.updateMeeting(riri.restContext, meeting.id, updates, function (err, meeting) {
                        assert.ok(err);
                        assert.equal(err.code, 400);
                        
                        return callback();
                    });
                });
            });
            
        });

        it('should not be successfull with no fields to update', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];
                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err, meeting) {
                    assert.ok(!err);

                    var updates = {};

                    RestAPI.MeetingsJitsi.updateMeeting(riri.restContext, meeting.id, updates, function (err, meeting) {
                        assert.ok(err);
                        assert.equal(err.code, 400);
                        
                        return callback();
                    });
                });
            });

        });

        it('should not be successfull with an invalid chat value', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];
                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err, meeting) {
                    assert.ok(!err);

                    var updates = {
                        'displayName': 'new-display-name',
                        'chat': 'not-an-valid-value'
                    };

                    RestAPI.MeetingsJitsi.updateMeeting(riri.restContext, meeting.id, updates, function (err, meeting) {
                        assert.ok(err);
                        assert.equal(err.code, 400);
                        
                        return callback();
                    });
                });
            });

        });

        it('should not be susccessfull with an invalid contactList value', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];
                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err, meeting) {
                    assert.ok(!err);

                    var updates = {
                        'displayName': 'new-display-name',
                        'contactList': 'not-an-valid-value'
                    };

                    RestAPI.MeetingsJitsi.updateMeeting(riri.restContext, meeting.id, updates, function (err, meeting) {
                        assert.ok(err);
                        assert.equal(err.code, 400);
                        
                        return callback();
                    });
                });
            });
            
        });

        it('should not be successfull with a invalid meeting id', function (callback) {
            
            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];
                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err, meeting) {
                    assert.ok(!err);

                    var updates = {
                        'displayName': 'new-display-name',
                        'description': 'new-description'
                    };

                    RestAPI.MeetingsJitsi.updateMeeting(riri.restContext, 'not-an-id', updates, function (err, meeting) {
                        assert.ok(err);
                        assert.equal(err.code, 400);
                        
                        return callback();
                    });
                });
            });

        });

        it('should not be successfull with an invalid field name', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];
                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err, meeting) {
                    assert.ok(!err);

                    var updates = {
                        'displayName': 'new-display-name',
                        'description': 'new-description',
                        'not-an-valid-field-name': 'test',
                    };

                    RestAPI.MeetingsJitsi.updateMeeting(riri.restContext, meeting.id, updates, function (err, meeting) {
                        assert.ok(err);
                        assert.equal(err.code, 400);
                        
                        return callback();
                    });
                });
            });

        });

        it('should not be successfull if the user is anonymous', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 1, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];
                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err, meeting) {
                    assert.ok(!err);

                    var updates = {
                        'displayName': 'new-display-name',
                        'description': 'new-description'
                    };

                    RestAPI.MeetingsJitsi.updateMeeting(camAnonymousRestCtx, meeting.id, updates, function (err, meeting) {
                        assert.ok(err);
                        assert.equal(err.code, 401);
                        
                        return callback();
                    });
                });
            });

        });

        it('should not be successfull if the user is loggedin but not a member ', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 2, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];
                var fifi = _.values(user)[1];

                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, null, function (err, meeting) {
                    assert.ok(!err);

                    var updates = {
                        'displayName': 'new-display-name',
                        'description': 'new-description'
                    };

                    RestAPI.MeetingsJitsi.updateMeeting(fifi.restContext, meeting.id, updates, function (err, meeting) {
                        assert.ok(err);
                        assert.equal(err.code, 401);
                        
                        return callback();
                    });
                });
            });

        });

        it('should not be successfull if the user is just a member ', function (callback) {

            TestsUtil.generateTestUsers(camAdminRestCtx, 2, function (err, user) {
                assert.ok(!err);

                var riri = _.values(user)[0];
                var fifi = _.values(user)[1];

                var displayName = 'test-create-displayName';
                var description = 'test-create-description';
                var chat = true;
                var contactList = false;
                var visibility = 'public';
                var members = [fifi.user.id];

                RestAPI.MeetingsJitsi.createMeeting(riri.restContext, displayName, description, chat, contactList, visibility, null, members, function (err, meeting) {
                    assert.ok(!err);

                    var updates = {
                        'displayName': 'new-display-name',
                        'description': 'new-description'
                    };

                    RestAPI.MeetingsJitsi.updateMeeting(fifi.restContext, meeting.id, updates, function (err, meeting) {
                        assert.ok(err);
                        assert.equal(err.code, 401);
                        
                        return callback();
                    });
                });
            });

        });

    });

    describe('Delete meeting', function () {

        it('should successfully delete the meeting from the library');

        it('should not be successfull with an invalid meeting id');

        it('should successfully be deleted from the system only by managers');

        it('should clean up the associations when the meeting is deleted from the system');

    });

    describe('Manage meeting access', function () {

        it('should successfully update the meeting access');

        it('should not be successfull with an invalid meeting id');

        it('should not be successfull with an invalid visibility');

        it('should not be successfull with an invalid member id');

        it('should not be successfull with an invalid manager id');

        it('should not be successfull if the user is not authorized to manage the access of the meeting');

        it('should not be successfull if the update ends up with no manager for the meeting');

    });

    describe('Comment meeting', function () {

        it('should successfully comment the meeting');

        it('should not be successfull with an invalid meeting id');

        it('should not be successfull with an empty body');

        it('should not be successfull with an non-existing reply-to timestamp');

        it('should not be successfull with a body longer thant the maximum allowed size');

        it('should not be successfull with an anonymous user');

        it('should not be successfull with a non-member user');

    });

    describe('Delete comment meeting', function () {

        it('should successfully delete a comment from a meeting');

        it('should not be successfull with an invalid meeting id');

        it('should not be successfull with an invalid timestamp');

    });

});