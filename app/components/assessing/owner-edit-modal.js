import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class OwnerEditModalComponent extends Component {
  @service assessing;

  @tracked isSaving = false;
  @tracked showOwnerSearch = true;
  @tracked showCreateNew = false;
  @tracked searchTerm = '';
  @tracked searchResults = [];
  @tracked selectedExistingOwner = null;

  // Owner basic info
  @tracked ownerType = 'individual';
  @tracked firstName = '';
  @tracked lastName = '';
  @tracked businessName = '';
  @tracked email = '';
  @tracked phone = '';

  // Address
  @tracked street = '';
  @tracked city = '';
  @tracked state = '';
  @tracked zipCode = '';

  // Ownership details
  @tracked isAdditionalOwner = false;
  @tracked isMailTo = false;
  @tracked isBillCopy = false;
  @tracked ownershipPercentage = 0;
  @tracked ownershipType = 'fee_simple';
  @tracked receivesTaxBills = true;
  @tracked receivesNotices = true;
  @tracked notes = '';

  constructor() {
    super(...arguments);
    this.initializeForm();
  }

  initializeForm() {
    if (this.args.owner) {
      // Edit mode - populate existing data
      this.showOwnerSearch = false;
      this.showCreateNew = true;

      const owner = this.args.owner;

      console.log('Editing owner:', owner);

      // Check if this is legacy data that needs migration
      if (owner._isLegacy) {
        // Handle legacy owner data format
        console.log('Handling legacy owner data');
        this.handleLegacyOwnerData(owner);
      } else {
        // Handle new owner structure
        console.log('Handling new owner data');
        this.handleNewOwnerData(owner);
      }
    } else {
      // Add mode - set defaults
      console.log('Adding new owner, isPrimary:', this.args.isPrimary);
      this.showOwnerSearch = true; // Show search first for new owners
      this.showCreateNew = false; // Don't show form until user clicks "Create New"

      if (!this.args.isPrimary) {
        this.isMailTo = true; // Default new non-primary owners to mail-to
      } else {
        this.isAdditionalOwner = true;
        this.ownershipPercentage = 100;
      }
    }

    console.log(
      'After initialization - ownerType:',
      this.ownerType,
      'showCreateNew:',
      this.showCreateNew,
      'firstName:',
      this.firstName,
      'lastName:',
      this.lastName,
      'businessName:',
      this.businessName,
    );
  }

  handleLegacyOwnerData(owner) {
    // For legacy data, we need to parse the name and address
    const name = owner.primary_name || '';
    const address = owner.mailing_address || '';

    console.log('Legacy owner name:', name);

    // Try to parse the name (assume "Last, First" or "Business Name" format)
    if (name.includes(',')) {
      // Likely "Last, First" format
      const [lastName, firstName] = name.split(',').map((part) => part.trim());
      console.log('Detected individual:', firstName, lastName);
      this.ownerType = 'individual';
      this.firstName = firstName || '';
      this.lastName = lastName || '';
    } else {
      // Assume business name
      console.log('Detected business:', name);
      this.ownerType = 'business';
      this.businessName = name;
    }

    // Parse address (basic parsing)
    if (address) {
      const addressParts = address.split(',').map((part) => part.trim());
      if (addressParts.length >= 1) this.street = addressParts[0];
      if (addressParts.length >= 2) this.city = addressParts[1];
      if (addressParts.length >= 3) {
        const stateZip = addressParts[2].split(' ');
        this.state = stateZip[0] || '';
        this.zipCode = stateZip.slice(1).join(' ') || '';
      }
    }

    // Set primary owner defaults
    if (this.args.isPrimary) {
      this.isAdditionalOwner = true;
      this.ownershipPercentage = 100;
      this.receivesTaxBills = true;
      this.receivesNotices = true;
    }
  }

  handleNewOwnerData(owner) {
    // Basic info
    console.log('New owner data:', owner);
    if (owner.first_name || owner.owner_type === 'individual') {
      console.log('Detected individual with first_name:', owner.first_name);
      this.ownerType = 'individual';
      this.firstName = owner.first_name || '';
      this.lastName = owner.last_name || '';
    } else {
      console.log('Detected business/other, owner_type:', owner.owner_type);
      this.ownerType = owner.owner_type || 'business';
      this.businessName = owner.business_name || owner.owner_name || '';
    }

    this.email = owner.email || '';
    this.phone = owner.phone || '';

    // Address - handle both new structure (address/mailing_address objects) and legacy flat fields
    const address = owner.mailing_address || owner.address || {};
    this.street = address.street || owner.mailing_street || '';
    this.city = address.city || owner.mailing_city || '';
    this.state = address.state || owner.mailing_state || '';
    this.zipCode = address.zip_code || owner.mailing_zipcode || '';

    // Ownership details
    this.isAdditionalOwner = owner.additional_owner || false;
    this.isMailTo = owner.mail_to || false;
    this.isBillCopy = owner.bill_copy || false;
    this.ownershipPercentage = owner.ownership_percentage || 0;
    this.ownershipType = owner.ownership_type || 'fee_simple';
    this.receivesTaxBills = owner.receives_tax_bills !== false;
    this.receivesNotices = owner.receives_notices !== false;
    this.notes = owner.notes || '';
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
  toggleCreateNew() {
    this.showCreateNew = !this.showCreateNew;
    if (this.showCreateNew) {
      this.selectedExistingOwner = null;
    }
  }

  @action
  updateSearchTerm(event) {
    this.searchTerm = event.target.value;
  }

  @action
  async searchOwners() {
    if (!this.searchTerm.trim()) return;

    try {
      const response = await this.assessing.localApi.get('/owners/search', {
        q: this.searchTerm,
        limit: 10,
      });
      this.searchResults = response.owners || response;
    } catch (error) {
      console.error('Failed to search owners:', error);
      this.searchResults = [];
    }
  }

  @action
  selectExistingOwner(owner) {
    this.selectedExistingOwner = owner;
    this.searchResults = [];
    this.showCreateNew = false;
  }

  // Form field update actions
  @action updateOwnerType(event) {
    this.ownerType = event.target.value;
  }
  @action updateFirstName(event) {
    this.firstName = event.target.value;
  }
  @action updateLastName(event) {
    this.lastName = event.target.value;
  }
  @action updateBusinessName(event) {
    this.businessName = event.target.value;
  }
  @action updateEmail(event) {
    this.email = event.target.value;
  }
  @action updatePhone(event) {
    this.phone = event.target.value;
  }
  @action updateStreet(event) {
    this.street = event.target.value;
  }
  @action updateCity(event) {
    this.city = event.target.value;
  }
  @action updateState(event) {
    this.state = event.target.value;
  }
  @action updateZipCode(event) {
    this.zipCode = event.target.value;
  }
  @action updateOwnershipPercentage(event) {
    this.ownershipPercentage = parseFloat(event.target.value) || 0;
  }
  @action updateOwnershipType(event) {
    this.ownershipType = event.target.value;
  }
  @action updateNotes(event) {
    this.notes = event.target.value;
  }

  @action toggleAdditionalOwner(event) {
    this.isAdditionalOwner = event.target.checked;
  }
  @action toggleMailTo(event) {
    this.isMailTo = event.target.checked;
  }
  @action toggleBillCopy(event) {
    this.isBillCopy = event.target.checked;
  }
  @action toggleReceivesTaxBills(event) {
    this.receivesTaxBills = event.target.checked;
  }
  @action toggleReceivesNotices(event) {
    this.receivesNotices = event.target.checked;
  }

  @action
  async saveOwner(event) {
    event?.preventDefault();

    if (this.isSaving) return;

    // Basic validation
    if (!this.selectedExistingOwner && this.showCreateNew) {
      if (
        this.ownerType === 'individual' &&
        (!this.firstName.trim() || !this.lastName.trim())
      ) {
        alert('Please enter first and last name');
        return;
      }
      if (this.ownerType !== 'individual' && !this.businessName.trim()) {
        alert('Please enter business/organization name');
        return;
      }
      if (
        !this.street.trim() ||
        !this.city.trim() ||
        !this.state.trim() ||
        !this.zipCode.trim()
      ) {
        alert('Please enter complete mailing address');
        return;
      }
    }

    this.isSaving = true;

    try {
      let ownerData;

      if (this.selectedExistingOwner) {
        // Using existing owner
        ownerData = {
          existing_owner_id: this.selectedExistingOwner.id,
          additional_owner: this.isAdditionalOwner,
          mail_to: this.isMailTo,
          bill_copy: this.isBillCopy,
          ownership_percentage: this.ownershipPercentage,
          ownership_type: this.ownershipType,
          receives_tax_bills: this.receivesTaxBills,
          receives_notices: this.receivesNotices,
          notes: this.notes,
        };
      } else {
        // Creating new owner
        ownerData = {
          // Owner info
          owner_type: this.ownerType,
          first_name: this.ownerType === 'individual' ? this.firstName : null,
          last_name: this.ownerType === 'individual' ? this.lastName : null,
          business_name:
            this.ownerType !== 'individual' ? this.businessName : null,
          email: this.email,
          phone: this.phone,

          // Mailing address
          mailing_street: this.street,
          mailing_city: this.city,
          mailing_state: this.state,
          mailing_zipcode: this.zipCode,

          // Ownership details
          additional_owner: this.isAdditionalOwner,
          mail_to: this.isMailTo,
          bill_copy: this.isBillCopy,
          ownership_percentage: this.ownershipPercentage,
          ownership_type: this.ownershipType,
          receives_tax_bills: this.receivesTaxBills,
          receives_notices: this.receivesNotices,
          notes: this.notes,
        };
      }

      // For primary owners, ensure they are marked as additional_owner
      if (this.args.isPrimary) {
        ownerData.additional_owner = true;
        ownerData.is_primary = true;

        // If this is legacy data being migrated, add a flag
        if (this.args.owner?._isLegacy) {
          ownerData._migrateLegacy = true;
        }
      }

      await this.args.onSave(ownerData);
    } catch (error) {
      console.error('Failed to save owner:', error);
      alert('Failed to save owner. Please try again.');
    } finally {
      this.isSaving = false;
    }
  }
}
