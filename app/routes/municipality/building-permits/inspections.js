import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsInspectionsRoute extends Route {
  @service municipality;
  @service api;

  queryParams = {
    tab: { refreshModel: true },
    dateFrom: { refreshModel: true },
    dateTo: { refreshModel: true },
    inspector: { refreshModel: true },
    status: { refreshModel: true },
    type: { refreshModel: true },
    search: { refreshModel: true },
    page: { refreshModel: true },
  };

  async model(params) {
    const municipalityId = this.municipality.currentMunicipality?.id;

    // Build query params - only include non-empty values
    const queryParams = {
      page: params.page || 1,
      limit: 50,
    };

    if (params.tab) queryParams.tab = params.tab;
    if (params.dateFrom) queryParams.dateFrom = params.dateFrom;
    if (params.dateTo) queryParams.dateTo = params.dateTo;
    if (params.inspector) queryParams.inspector = params.inspector;
    if (params.status) queryParams.status = params.status;
    if (params.type) queryParams.type = params.type;
    if (params.search) queryParams.search = params.search;

    const response = await this.api.get(
      `/municipalities/${municipalityId}/inspections`,
      queryParams,
    );

    return {
      inspections: response.inspections,
      pagination: response.pagination,
      filters: response.filters,
      stats: response.stats,
      municipalityId,
    };
  }
}
