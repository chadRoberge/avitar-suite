import { helper } from '@ember/component/helper';

export default helper(function formatLandUseType([landUseType]) {
  const typeMap = {
    residential: 'Residential',
    residential_waterfront: 'Residential Waterfront',
    commercial: 'Commercial',
    residential_multifamily: 'Residential Multifamily',
  };
  return typeMap[landUseType] || landUseType;
});
