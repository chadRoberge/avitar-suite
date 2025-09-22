import Route from '@ember/routing/route';

export default class MunicipalityAssessingSketchIndexRoute extends Route {
  model() {
    // Sketch tools overview without specific property
    return {
      property: null,
      sketches: [],
      showPropertySelection: true,
    };
  }
}
