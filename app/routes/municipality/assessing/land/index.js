import Route from '@ember/routing/route';

export default class MunicipalityAssessingLandIndexRoute extends Route {
  model() {
    // Land assessment tools/overview without specific property
    return {
      property: null,
      landAssessment: null,
      landHistory: [],
      comparables: [],
      showPropertySelection: true,
    };
  }
}
