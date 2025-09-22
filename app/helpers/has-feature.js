import { helper } from '@ember/component/helper';
import { inject as service } from '@ember/service';

export default helper(function hasFeature(
  [moduleName, featureName],
  hash,
  { services },
) {
  return services.municipality.hasFeature(moduleName, featureName);
});
