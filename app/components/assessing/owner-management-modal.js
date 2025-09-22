import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class OwnerManagementModalComponent extends Component {
  @service assessing;

  @tracked isLoading = false;
  @tracked showOwnerEditModal = false;
  @tracked editingOwner = null;
  @tracked editingIsPrimary = false;

  get hasNewOwnerStructure() {
    return this.args.property?.owners?.primary ? true : false;
  }

  get primaryOwnerData() {
    if (this.hasNewOwnerStructure) {
      return this.args.property.owners.primary;
    } else {
      // Return legacy owner data in a format the edit modal can understand
      return {
        primary_name: this.args.property.owner?.primary_name,
        mailing_address: this.args.property.owner?.mailing_address,
        // Flag this as legacy data for migration
        _isLegacy: true,
      };
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  closeModal() {
    this.args.onClose();
  }

  @action
  addOwner() {
    this.editingOwner = null;
    this.editingIsPrimary = false;
    this.showOwnerEditModal = true;
  }

  @action
  editOwner(owner, isPrimary = false) {
    this.editingOwner = owner;
    this.editingIsPrimary = isPrimary;
    this.showOwnerEditModal = true;
  }

  @action
  editPrimaryOwner() {
    this.editingOwner = this.primaryOwnerData;
    this.editingIsPrimary = true;
    this.showOwnerEditModal = true;
  }

  @action
  closeOwnerEditModal() {
    this.showOwnerEditModal = false;
    this.editingOwner = null;
    this.editingIsPrimary = false;
  }

  @action
  async handleOwnerSave(ownerData) {
    this.isLoading = true;

    try {
      const propertyId = this.args.property.id;

      if (this.editingOwner) {
        // Update existing owner
        if (this.editingIsPrimary) {
          // Update primary owner (could be legacy migration or existing primary)
          const response = await this.assessing.localApi.put(
            `/properties/${propertyId}/owners/primary`,
            ownerData,
          );
          console.log('Updated primary owner:', response);
        } else {
          // Update additional owner/recipient
          const ownerId = this.editingOwner.owner_id || this.editingOwner.id;
          const response = await this.assessing.localApi.put(
            `/properties/${propertyId}/owners/${ownerId}`,
            ownerData,
          );
          console.log('Updated additional owner:', response);
        }
      } else {
        // Create new owner
        const response = await this.assessing.localApi.post(
          `/properties/${propertyId}/owners`,
          ownerData,
        );
        console.log('Created new owner:', response);
      }

      // Close the edit modal
      this.closeOwnerEditModal();

      // Notify parent component to refresh property data
      if (this.args.onOwnerUpdate) {
        await this.args.onOwnerUpdate();
      }
    } catch (error) {
      console.error('Failed to save owner:', error);
      // TODO: Show error notification to user
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async removeOwner(owner) {
    if (!confirm(`Are you sure you want to remove ${owner.owner_name}?`)) {
      return;
    }

    this.isLoading = true;

    try {
      const propertyId = this.args.property.id;
      const ownerId = owner.owner_id || owner.id;

      await this.assessing.localApi.delete(
        `/properties/${propertyId}/owners/${ownerId}`,
      );

      console.log('Removed owner:', owner.owner_name);

      // Notify parent component to refresh property data
      if (this.args.onOwnerUpdate) {
        await this.args.onOwnerUpdate();
      }
    } catch (error) {
      console.error('Failed to remove owner:', error);
      // TODO: Show error notification to user
    } finally {
      this.isLoading = false;
    }
  }
}
