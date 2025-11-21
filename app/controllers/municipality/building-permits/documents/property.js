import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';

export default class MunicipalityBuildingPermitsDocumentsPropertyController extends Controller {
  @service router;

  @action
  refreshDocuments() {
    // Refresh the current route to reload documents
    this.router.refresh('municipality.building-permits.documents.property');
  }
}
