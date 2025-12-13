import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsPermitsRoute extends Route {
  @service municipality;
  @service api;

  queryParams = {
    year: { refreshModel: true },
    permitTypeId: { refreshModel: true },
    status: { refreshModel: true },
    search: { refreshModel: true },
    page: { refreshModel: true },
  };

  async model(params) {
    const municipalityId = this.municipality.currentMunicipality?.id;

    // Build query params, excluding null/undefined values
    const queryParams = {
      page: params.page || 1,
      limit: 50,
    };

    if (params.year) {
      queryParams.year = params.year;
    }

    if (params.permitTypeId) {
      queryParams.permitTypeId = params.permitTypeId;
    }

    if (params.status) {
      queryParams.status = params.status;
    }

    if (params.search) {
      queryParams.search = params.search;
    }

    const response = await this.api.get(
      `/municipalities/${municipalityId}/permits`,
      queryParams,
    );

    return {
      permits: response.permits,
      pagination: response.pagination,
      filters: response.filters,
      municipalityId,
    };
  }
}
