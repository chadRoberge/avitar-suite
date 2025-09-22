import Route from '@ember/routing/route';

export default class MunicipalityAssessingFeaturesIndexRoute extends Route {
  model() {
    // Features assessment tools/overview without specific property
    return {
      property: null,
      features: [],
      featureCategories: [],
      featureHistory: [],
      showPropertySelection: true,
    };
  }
}
