import Route from '@ember/routing/route';

export default class MunicipalityAssessingGeneralIndexRoute extends Route {
  model() {
    // General assessment tools/overview without specific property
    return {
      property: null,
      assessment: null,
      assessmentHistory: [],
      showPropertySelection: true,
    };
  }
}
