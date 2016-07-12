

describe('Meeting Jitsi', function () {

    describe('Create meeting', function () {

        it('should create successfully the meeting with the proper model');

        it('should add the given users and groups to the meeting');

        it('should not be successfull with an anonymous user');

        it('should not be successfull with an empty display name');

        it('should not be successfull with a display name longer than the maximum allowed size');

        it('should not be successfull with a description longer than the maximum allowed size');

        it('should not be successfull with an invalid visibility');

        it('should not be successfull with an invalid manager id');

        it('should not be successfull with an invalid member id');

        it('should not be successfull with a private user as a member');

        it('should not be successfull with a private group as a member');

    });
    
    describe('Update meeting', function () {

        it('should update successfully the meeting');

        it('should not be successfull with an empty display name');

        it('should not be successfull with a display name longer than the maximum allowed size');

        it('should not be successfull with a description longer than the maximum allowed size');

        it('should not be successfull with a invalid meeting id');

        it('should not be successfull with no fields to update');

        it('should not be successfull if the user is unauthorized');

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