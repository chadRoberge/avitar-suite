import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MyPermitsCreateRoute extends Route {
  @service('current-user') currentUser;
  @service('hybrid-api') hybridApi;

  setupController(controller, model) {
    super.setupController(controller, model);
    // Initialize tracked permitData from model
    controller.permitData = { ...model.wizard.permitData };

    // If resuming a draft, pre-populate the controller state
    if (model.draftPermit) {
      const draft = model.draftPermit;

      console.log('🔧 Setting up controller with draft:', draft);

      // municipalityId, propertyId, permitTypeId are populated objects from backend
      const municipalityId = draft.municipalityId?._id || draft.municipalityId;
      const propertyId = draft.propertyId?._id || draft.propertyId;
      const permitTypeId = draft.permitTypeId?._id || draft.permitTypeId;

      // Set selected municipality
      controller.selectedMunicipality = model.municipalities.find(
        (m) =>
          m._id?.toString() === municipalityId?.toString() ||
          m.id?.toString() === municipalityId?.toString(),
      );

      console.log('🏛️ Selected municipality:', controller.selectedMunicipality);

      // Set selected property from populated data
      if (draft.propertyId && typeof draft.propertyId === 'object') {
        controller.selectedProperty = {
          _id: draft.propertyId._id,
          pidFormatted: draft.propertyId.pid_formatted,
          address: draft.propertyId.location?.address,
          owner: draft.propertyId.owner,
        };
        console.log('🏠 Selected property:', controller.selectedProperty);
      }

      // Load permit types for the municipality
      if (controller.selectedMunicipality) {
        const munId =
          controller.selectedMunicipality.id ||
          controller.selectedMunicipality._id;
        this.hybridApi
          .get(`/municipalities/${munId}/permit-types`)
          .then((response) => {
            controller.permitTypes = (response.permitTypes || []).map((pt) => ({
              ...pt,
              id: pt._id || pt.id,
            }));

            console.log('📋 Loaded permit types:', controller.permitTypes);

            // Set selected permit type with normalized custom form fields
            if (draft.permitTypeId && typeof draft.permitTypeId === 'object') {
              const permitType = controller.permitTypes.find(
                (pt) =>
                  pt._id?.toString() === draft.permitTypeId._id?.toString() ||
                  pt.id?.toString() === draft.permitTypeId._id?.toString(),
              );

              if (permitType) {
                controller.selectedPermitType = {
                  ...permitType,
                  customFormFields: (permitType.customFormFields || []).map(
                    (field) => ({
                      ...field,
                      id: field._id || field.id,
                    }),
                  ),
                };
                console.log(
                  '📝 Selected permit type:',
                  controller.selectedPermitType,
                );
              }
            }
          });
      }

      // Set current step to details (step 4) since property/type are already selected
      controller.currentStep = 4;

      // Store draft permit ID for later use
      controller.savedPermitId = draft._id;

      console.log(
        '✅ Controller setup complete. Current step:',
        controller.currentStep,
      );
    }
  }

  async model() {
    // Get user's accessible municipalities
    const user = this.currentUser.user;

    // Both contractors and citizens can apply to any municipality
    // Municipality settings will determine if they require approval/verification
    let municipalities = [];
    let contractor = null;
    let draftPermit = null;

    try {
      // Fetch all active municipalities using local-first strategy
      const municipalitiesResponse = await this.hybridApi.get(
        '/municipalities?active=true',
      );
      municipalities = municipalitiesResponse.municipalities || [];

      // If contractor, also fetch contractor info for license data
      if (this.currentUser.isContractor && user.contractor_id) {
        const contractorResponse = await this.hybridApi.get(
          `/contractors/${user.contractor_id}`,
        );
        contractor = contractorResponse.contractor;
      }

      // Check if resuming a draft permit
      const draftPermitId = sessionStorage.getItem('resumeDraftPermitId');
      if (draftPermitId) {
        console.log('📝 Loading draft permit:', draftPermitId);

        // Load the draft permit using local-first strategy
        const draftResponse = await this.hybridApi.get(`/permits/${draftPermitId}`);
        draftPermit = draftResponse;

        // Clear the session storage flag
        sessionStorage.removeItem('resumeDraftPermitId');

        console.log('✅ Draft permit loaded:', draftPermit);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }

    // Initialize permit data
    let permitData;

    if (draftPermit) {
      // Extract IDs from populated objects (backend returns populated data)
      const municipalityId =
        draftPermit.municipalityId?._id || draftPermit.municipalityId;
      const propertyId = draftPermit.propertyId?._id || draftPermit.propertyId;
      const permitTypeId =
        draftPermit.permitTypeId?._id || draftPermit.permitTypeId;

      // Use draft permit data with IDs
      permitData = {
        municipalityId: municipalityId,
        propertyId: propertyId,
        permitTypeId: permitTypeId,
        type: draftPermit.type,
        description: draftPermit.description || '',
        scopeOfWork: draftPermit.scopeOfWork || '',
        estimatedValue: draftPermit.estimatedValue || 0,
        squareFootage: draftPermit.squareFootage || null,
        customFields: draftPermit.customFields || {},
        applicant: draftPermit.applicant || {
          name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          phone: user.phone || '',
          relationshipToProperty: 'contractor',
        },
        contractor_id: user.contractor_id,
        submitted_by: user._id,
      };

      console.log('📦 Permit data prepared:', permitData);
    } else {
      // Create new permit data
      permitData = {
        municipalityId: null,
        propertyId: null,
        permitTypeId: null,
        type: null,
        description: '',
        scopeOfWork: '',
        estimatedValue: 0,
        squareFootage: null,
        customFields: {},
        applicant: {
          name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          phone: user.phone || '',
          relationshipToProperty: 'contractor',
        },
        contractor_id: user.contractor_id,
        submitted_by: user._id,
      };
    }

    return {
      municipalities,
      contractor,
      user,
      isContractor: this.currentUser.isContractor,
      contractor_id: user.contractor_id,
      draftPermit,
      // Initialize wizard state
      wizard: {
        currentStep: 1,
        totalSteps: 5,
        permitData,
      },
    };
  }
}
