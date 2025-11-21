import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsImportRoute extends Route {
  @service api;
  @service municipality;

  async model() {
    const parentModel = this.modelFor('municipality.assessing.settings');

    return {
      ...parentModel,
      camaSystemOptions: [
        { value: 'avitar-desktop', label: 'Avitar Desktop' },
        { value: 'vision-appraisal', label: 'Vision Appraisal' },
        { value: 'harris-govern', label: 'Harris Govern' },
      ],
    };
  }
}
