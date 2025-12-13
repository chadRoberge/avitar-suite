import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class ContractorManagementDocumentsRoute extends Route {
  @service api;
  @service router;
  @service('current-user') currentUser;

  beforeModel() {
    // Only contractors can access
    if (
      !this.currentUser.isContractor ||
      !this.currentUser.user?.contractor_id
    ) {
      this.router.transitionTo('my-permits');
    }
  }

  async model() {
    const parentModel = this.modelFor('contractor-management');
    const contractor = parentModel.contractor;
    const contractorId = contractor._id;

    try {
      // Load folder structure and files
      const [foldersResponse, filesResponse] = await Promise.all([
        this.api.get(`/contractors/${contractorId}/files/folders`),
        this.api.get(`/contractors/${contractorId}/files`),
      ]);

      return {
        ...parentModel,
        contractorId,
        folders: foldersResponse.folders || foldersResponse || {},
        files: filesResponse.files || filesResponse || [],
      };
    } catch (error) {
      console.error('Error loading contractor document library:', error);
      return {
        ...parentModel,
        contractorId,
        folders: {},
        files: [],
      };
    }
  }
}
