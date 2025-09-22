import Route from '@ember/routing/route';

export default class MunicipalityAssessingBuildingIndexRoute extends Route {
  model() {
    // Building assessment tools/overview without specific property
    return {
      property: null,
      buildingAssessment: null,
      buildingHistory: [],
      depreciation: {},
      improvements: [],
      showPropertySelection: true,
    };
  }
}
