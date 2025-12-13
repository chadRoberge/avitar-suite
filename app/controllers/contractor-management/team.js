import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class ContractorManagementTeamController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked showAddMemberModal = false;
  @tracked showEditMemberModal = false;
  @tracked selectedMember = null;
  @tracked isLoading = false;

  // Add member form
  @tracked newMemberEmail = '';
  @tracked newMemberRole = 'employee';
  @tracked newMemberTitle = '';
  @tracked newMemberPermissions = [];

  get contractor() {
    return this.model.contractor;
  }

  get needsOnboarding() {
    return this.model.needsOnboarding || !this.contractor;
  }

  get hasTeamManagementFeature() {
    if (!this.contractor) return false;
    return this.contractor.subscription?.features?.team_management === true;
  }

  get subscriptionPlan() {
    if (!this.contractor) return 'free';
    return this.contractor.subscription?.plan || 'free';
  }

  get maxTeamMembers() {
    if (!this.contractor) return 1;
    return this.contractor.subscription?.features?.max_team_members || 1;
  }

  get activeMembers() {
    if (!this.contractor) return [];
    return this.contractor.members?.filter((m) => m.is_active) || [];
  }

  get canAddMember() {
    return this.activeMembers.length < this.maxTeamMembers;
  }

  get availablePermissions() {
    return [
      {
        id: 'submit_permits',
        label: 'Submit Permits',
        description: 'Can create and submit permit applications',
      },
      {
        id: 'edit_permits',
        label: 'Edit Permits',
        description: 'Can edit permit applications',
      },
      {
        id: 'view_all_permits',
        label: 'View All Permits',
        description: 'Can view all company permits',
      },
      {
        id: 'view_own_permits',
        label: 'View Own Permits',
        description: 'Can only view permits they created',
      },
      {
        id: 'manage_team',
        label: 'Manage Team',
        description: 'Can add/remove team members',
      },
      {
        id: 'manage_company_info',
        label: 'Manage Company',
        description: 'Can edit company information',
      },
    ];
  }

  get roleOptions() {
    return [
      {
        value: 'employee',
        label: 'Employee',
        description: 'Standard team member',
      },
      {
        value: 'admin',
        label: 'Admin',
        description: 'Can manage team and settings',
      },
      {
        value: 'office_staff',
        label: 'Office Staff',
        description: 'Administrative support',
      },
    ];
  }

  @action
  openAddMemberModal() {
    if (!this.hasTeamManagementFeature) {
      this.notifications.warning(
        'Team management is a premium feature. Please upgrade your subscription.',
      );
      this.router.transitionTo('contractor-management.subscription');
      return;
    }

    if (!this.canAddMember) {
      this.notifications.warning(
        `You've reached the maximum number of team members (${this.maxTeamMembers}) for your plan. Please upgrade to add more members.`,
      );
      this.router.transitionTo('contractor-management.subscription');
      return;
    }

    this.showAddMemberModal = true;
  }

  @action
  closeAddMemberModal() {
    this.showAddMemberModal = false;
    this.resetAddMemberForm();
  }

  @action
  resetAddMemberForm() {
    this.newMemberEmail = '';
    this.newMemberRole = 'employee';
    this.newMemberTitle = '';
    this.newMemberPermissions = [];
  }

  @action
  togglePermission(permissionId) {
    if (this.newMemberPermissions.includes(permissionId)) {
      this.newMemberPermissions = this.newMemberPermissions.filter(
        (p) => p !== permissionId,
      );
    } else {
      this.newMemberPermissions = [...this.newMemberPermissions, permissionId];
    }
  }

  @action
  async addTeamMember() {
    if (!this.newMemberEmail) {
      this.notifications.error('Please enter an email address');
      return;
    }

    this.isLoading = true;

    try {
      const response = await this.api.post(
        `/contractors/${this.contractor._id}/members`,
        {
          email: this.newMemberEmail,
          role: this.newMemberRole,
          title: this.newMemberTitle,
          permissions: this.newMemberPermissions,
        },
      );

      this.notifications.success('Team member added successfully');
      this.closeAddMemberModal();

      // Refresh the contractor data
      this.send('refreshModel');
    } catch (error) {
      console.error('Error adding team member:', error);
      this.notifications.error(
        error.message || 'Failed to add team member. Please try again.',
      );
    } finally {
      this.isLoading = false;
    }
  }

  @action
  openEditMemberModal(member) {
    this.selectedMember = member;
    // Initialize edit form with member's current data
    this.newMemberRole = member.role;
    this.newMemberTitle = member.title || '';
    this.newMemberPermissions = [...(member.permissions || [])];
    this.showEditMemberModal = true;
  }

  @action
  closeEditMemberModal() {
    this.showEditMemberModal = false;
    this.selectedMember = null;
    this.resetAddMemberForm();
  }

  @action
  async saveEditedMember() {
    if (!this.selectedMember) {
      this.notifications.error('No member selected');
      return;
    }

    this.isLoading = true;

    try {
      await this.api.put(
        `/contractors/${this.contractor._id}/members/${this.selectedMember.user_id._id}`,
        {
          role: this.newMemberRole,
          title: this.newMemberTitle,
          permissions: this.newMemberPermissions,
        },
      );

      this.notifications.success('Team member updated successfully');
      this.closeEditMemberModal();

      // Refresh the contractor data
      this.send('refreshModel');
    } catch (error) {
      console.error('Error updating team member:', error);
      this.notifications.error(
        error.message || 'Failed to update team member. Please try again.',
      );
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async removeMember(member) {
    if (
      !confirm(
        `Are you sure you want to remove ${member.user_id.first_name} ${member.user_id.last_name} from your team?`,
      )
    ) {
      return;
    }

    this.isLoading = true;

    try {
      await this.api.delete(
        `/contractors/${this.contractor._id}/members/${member.user_id._id}`,
      );

      this.notifications.success('Team member removed successfully');
      this.send('refreshModel');
    } catch (error) {
      console.error('Error removing team member:', error);
      this.notifications.error('Failed to remove team member');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  updateEmail(event) {
    this.newMemberEmail = event.target.value;
  }

  @action
  updateRole(event) {
    this.newMemberRole = event.target.value;
  }

  @action
  updateTitle(event) {
    this.newMemberTitle = event.target.value;
  }
}
