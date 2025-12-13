import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import LandAssessmentCalculator from 'avitar-suite/utils/land-assessment-calculator';

export default class AssessingLandEditModalComponent extends Component {
  @service municipality;
  @service assessing;
  @service('property-cache') propertyCache;
  @service('hybrid-api') hybridApi;

  @tracked isLoading = false;
  @tracked isSaving = false;
  @tracked isDataLoaded = false;
  @tracked landAssessment = {};
  @tracked landUseEntries = [];
  @tracked availableZones = [];
  @tracked availableNeighborhoods = [];
  @tracked availableSites = [];
  @tracked availableDriveways = [];
  @tracked availableRoads = [];
  @tracked availableTopology = [];
  @tracked availableLandUseDetails = [];
  @tracked availableTaxationCategories = [];
  @tracked availableCurrentUseCategories = [];
  @tracked acreageDiscountSettings = null;
  @tracked landLadders = {}; // Grouped by zone ID
  @tracked calculator = null;

  // Cache reference data to prevent loss during local-first sync
  _cachedReferenceData = null;

  constructor() {
    super(...arguments);

    console.log('🚀 Land Edit Modal - Constructor called');
    console.log('🚀 landAssessment prop:', this.args.landAssessment);

    // Listen for configuration updates
    this.hybridApi.on(
      'configurationUpdated',
      this,
      'handleConfigurationUpdate',
    );

    this.initializeData();
    // Load all municipality reference data upfront
    this.loadMunicipalityOptions();
  }

  willDestroy() {
    super.willDestroy();
    // Remove event listener
    this.hybridApi.off(
      'configurationUpdated',
      this,
      'handleConfigurationUpdate',
    );
  }

  /**
   * Handle configuration updates from HybridAPI
   * Reload affected data in background
   */
  @action
  async handleConfigurationUpdate(changes) {
    if (changes.landLadders || changes.zones || changes.propertyAttributes) {
      console.log(
        '🔄 Configuration updated, refreshing land assessment data...',
      );

      // Reload reference data in background
      await this.loadMunicipalityOptions();

      // Notify user subtly (optional)
      console.log('✅ Land assessment configuration refreshed');
    }
  }

  /**
   * Extract ObjectId from a field that might be an ObjectId string or a populated object
   * Returns null if the value is not a valid ObjectId
   */
  extractObjectId(field) {
    if (!field) return null;

    // If it's an object with an _id or id, return it
    if (typeof field === 'object') {
      if (field._id) {
        return String(field._id);
      }
      if (field.id) {
        return String(field.id);
      }
    }

    // If it's a string, validate it's a proper ObjectId (24 hex characters)
    if (typeof field === 'string') {
      // ObjectIds are 24 character hex strings
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(field);
      if (isValidObjectId) {
        return field;
      }
      // If it's not a valid ObjectId, it's probably old data
      console.warn('⚠️ Invalid ObjectId format, ignoring:', field);
      return null;
    }

    return null;
  }

  initializeData() {
    if (this.args.landAssessment) {
      // Extract ObjectIds from all reference fields that may be populated objects
      // The nested objects (e.g., zone: { _id, name, description }) are converted to just the ObjectId string
      this.landAssessment = {
        ...this.args.landAssessment,
        zone: this.extractObjectId(this.args.landAssessment.zone),
        neighborhood: this.extractObjectId(
          this.args.landAssessment.neighborhood,
        ),
        taxation_category: this.extractObjectId(
          this.args.landAssessment.taxation_category,
        ),
        site_conditions: this.extractObjectId(
          this.args.landAssessment.site_conditions,
        ),
        driveway_type: this.extractObjectId(
          this.args.landAssessment.driveway_type,
        ),
        road_type: this.extractObjectId(this.args.landAssessment.road_type),
      };

      console.log('🔍 Land Edit Modal - Initialized data:', {
        zone_raw: this.args.landAssessment.zone,
        zone_extracted: this.landAssessment.zone,
        neighborhood_raw: this.args.landAssessment.neighborhood,
        neighborhood_extracted: this.landAssessment.neighborhood,
        site_conditions_raw: this.args.landAssessment.site_conditions,
        site_extracted: this.landAssessment.site_conditions,
        driveway_type_raw: this.args.landAssessment.driveway_type,
        driveway_extracted: this.landAssessment.driveway_type,
        road_type_raw: this.args.landAssessment.road_type,
        road_extracted: this.landAssessment.road_type,
      });

      // Ensure all entries have unique IDs for stable rendering
      this.landUseEntries = (
        this.args.landAssessment.land_use_details || []
      ).map((entry, index) => {
        console.log(`🔍 Land use entry ${index}:`, {
          land_use_detail_id: entry.land_use_detail_id,
          land_use_type: entry.land_use_type,
          topography_id: entry.topography_id,
          topography: entry.topography,
        });
        return {
          ...entry,
          id: entry.id || `existing_${index}_${Date.now()}`,
          // Extract ObjectId from land_use_detail_id if it's a populated object
          land_use_detail_id: this.extractObjectId(entry.land_use_detail_id),
          // Extract ObjectId from topography_id if it's a populated object
          topography_id: this.extractObjectId(entry.topography_id),
        };
      });
    }
  }

  async loadMunicipalityOptions() {
    try {
      this.isLoading = true;
      // Load all reference data in parallel - handle each individually
      const results = await Promise.allSettled([
        this.municipality.getZones(),
        this.municipality.getNeighborhoods(),
        this.municipality.getSiteConditions(),
        this.municipality.getDrivewayTypes(),
        this.municipality.getRoadTypes(),
        this.assessing.getTopologyAttributes(),
        this.assessing.getLandLadders(),
        this.assessing.getLandUseDetails(),
        this.assessing.getLandTaxationCategories(),
        this.assessing.getCurrentUseSettings(),
        this.assessing.getAcreageDiscountSettings(),
      ]);

      // Only set data from successful API calls with enhanced debugging
      if (results[0].status === 'fulfilled') {
        this.availableZones = results[0].value.zones;
        console.log(
          '🔍 Zones loaded:',
          this.availableZones?.length || 0,
          this.availableZones,
        );
        // Debug: Check the structure of zone objects
        if (this.availableZones && this.availableZones.length > 0) {
          console.log('🔍 First zone structure:', this.availableZones[0]);
          console.log('🔍 Zone has _id?', '_id' in this.availableZones[0]);
          console.log('🔍 Zone has id?', 'id' in this.availableZones[0]);
          console.log(
            '🔍 Current landAssessment.zone:',
            this.landAssessment.zone,
          );
        }
      } else {
        console.error('❌ Failed to load zones:', results[0].reason);
      }
      if (results[1].status === 'fulfilled') {
        this.availableNeighborhoods = results[1].value.neighborhoodCodes;
        console.log(
          '🔍 Neighborhoods loaded:',
          this.availableNeighborhoods?.length || 0,
          this.availableNeighborhoods,
        );
        // Debug: Check the structure of neighborhood objects
        if (
          this.availableNeighborhoods &&
          this.availableNeighborhoods.length > 0
        ) {
          console.log(
            '🔍 First neighborhood structure:',
            this.availableNeighborhoods[0],
          );
          console.log(
            '🔍 Neighborhood has _id?',
            '_id' in this.availableNeighborhoods[0],
          );
          console.log(
            '🔍 Neighborhood has id?',
            'id' in this.availableNeighborhoods[0],
          );
          console.log(
            '🔍 Current landAssessment.neighborhood:',
            this.landAssessment.neighborhood,
          );
        }
      } else {
        console.error('❌ Failed to load neighborhoods:', results[1].reason);
      }
      if (results[2].status === 'fulfilled') {
        this.availableSites = results[2].value.siteAttributes;
        console.log(
          '🔍 Site conditions loaded:',
          this.availableSites?.length || 0,
          this.availableSites,
        );
        // Debug: Check the structure of site objects
        if (this.availableSites && this.availableSites.length > 0) {
          console.log('🔍 First site structure:', this.availableSites[0]);
          console.log('🔍 Site has _id?', '_id' in this.availableSites[0]);
          console.log('🔍 Site has id?', 'id' in this.availableSites[0]);
          console.log(
            '🔍 Current landAssessment.site_conditions:',
            this.landAssessment.site_conditions,
          );
        }
      } else {
        console.error('❌ Failed to load site conditions:', results[2].reason);
      }
      if (results[3].status === 'fulfilled') {
        this.availableDriveways = results[3].value.drivewayAttributes;
        console.log(
          '🔍 Driveway types loaded:',
          this.availableDriveways?.length || 0,
          this.availableDriveways,
        );
        // Debug: Check the structure of driveway objects
        if (this.availableDriveways && this.availableDriveways.length > 0) {
          console.log(
            '🔍 First driveway structure:',
            this.availableDriveways[0],
          );
          console.log(
            '🔍 Driveway has _id?',
            '_id' in this.availableDriveways[0],
          );
          console.log(
            '🔍 Driveway has id?',
            'id' in this.availableDriveways[0],
          );
          console.log(
            '🔍 Current landAssessment.driveway_type:',
            this.landAssessment.driveway_type,
          );
        }
      } else {
        console.error('❌ Failed to load driveway types:', results[3].reason);
      }
      if (results[4].status === 'fulfilled') {
        this.availableRoads = results[4].value.roadAttributes;
        console.log(
          '🔍 Road types loaded:',
          this.availableRoads?.length || 0,
          this.availableRoads,
        );
        // Debug: Check the structure of road objects
        if (this.availableRoads && this.availableRoads.length > 0) {
          console.log('🔍 First road structure:', this.availableRoads[0]);
          console.log('🔍 Road has _id?', '_id' in this.availableRoads[0]);
          console.log('🔍 Road has id?', 'id' in this.availableRoads[0]);
          console.log(
            '🔍 Current landAssessment.road_type:',
            this.landAssessment.road_type,
          );
        }
      } else {
        console.error('❌ Failed to load road types:', results[4].reason);
      }
      // Extract data from API responses
      // Each assessing API call corresponds to a specific data type

      // Process each API response individually based on its expected type
      if (results[5].status === 'fulfilled') {
        // Topology attributes (index 5)
        const topologyResponse = results[5].value;
        console.log(
          '🔍 Raw topology response structure:',
          Array.isArray(topologyResponse) ? 'Array' : 'Object',
          topologyResponse,
        );

        // Handle proper topology attributes response format
        if (topologyResponse && topologyResponse.topologyAttributes) {
          this.availableTopology = topologyResponse.topologyAttributes;
        } else if (Array.isArray(topologyResponse)) {
          // Check if this is valid topology data (should have displayText field)
          const hasValidStructure =
            topologyResponse.length > 0 &&
            topologyResponse[0].displayText !== undefined;

          if (!hasValidStructure && topologyResponse.length > 0) {
            console.warn(
              '❌ Invalid topology data structure detected (has sketchSubAreaFactors instead of displayText). Forcing server refresh...',
            );
            // Clear bad cache and force server fetch
            const freshTopology = await this.assessing.getTopologyAttributes(
              null,
              { forceRefresh: true },
            );
            this.availableTopology = freshTopology.topologyAttributes || [];
          } else {
            this.availableTopology = topologyResponse;
          }
        } else {
          console.warn(
            '⚠️ Unexpected topology response format, setting empty array',
          );
          this.availableTopology = [];
        }

        console.log(
          '🔍 Topology loaded:',
          this.availableTopology?.length || 0,
          this.availableTopology,
        );
      } else {
        console.error('❌ Failed to load topology:', results[5].reason);
        this.availableTopology = [];
      }

      if (results[6].status === 'fulfilled') {
        // Land ladders (index 6)
        const landLaddersResponse = results[6].value;
        console.log(
          '🔍 Raw land ladders response structure:',
          Array.isArray(landLaddersResponse) ? 'Array' : 'Object',
          landLaddersResponse,
        );

        let landLaddersData = [];

        // Handle different response formats from API/cache
        if (Array.isArray(landLaddersResponse)) {
          // Check if array contains a single API response wrapper object
          if (
            landLaddersResponse.length === 1 &&
            landLaddersResponse[0].success !== undefined &&
            landLaddersResponse[0].landLadders
          ) {
            // Unwrap: [{success: true, landLadders: [...]}] -> [...]
            console.log('🔄 Unwrapping cached API response from array wrapper');
            landLaddersData = landLaddersResponse[0].landLadders;
          } else if (
            landLaddersResponse.length > 0 &&
            (landLaddersResponse[0].tiers || landLaddersResponse[0].zoneId)
          ) {
            // Direct array of ladder objects
            landLaddersData = landLaddersResponse;
          } else {
            // Unknown array format, use as-is
            landLaddersData = landLaddersResponse;
          }
        } else if (landLaddersResponse && landLaddersResponse.landLadders) {
          // Direct API response: {success: true, landLadders: [...]}
          landLaddersData = landLaddersResponse.landLadders;
        } else if (
          landLaddersResponse &&
          landLaddersResponse.success !== undefined
        ) {
          // API response without landLadders property (empty result)
          landLaddersData = [];
        }

        // Validate that we have a proper array of ladder objects
        const hasValidStructure =
          Array.isArray(landLaddersData) &&
          (landLaddersData.length === 0 ||
            landLaddersData[0].tiers !== undefined ||
            landLaddersData[0].zoneId !== undefined);

        // If structure is still invalid, force refresh from server
        if (!hasValidStructure && landLaddersData.length > 0) {
          console.warn(
            '❌ Invalid land ladders data structure detected after unwrapping. Forcing server refresh...',
          );
          const freshLandLadders = await this.assessing.getLandLadders(null, {
            forceRefresh: true,
          });

          // Re-unwrap the fresh response
          if (Array.isArray(freshLandLadders)) {
            if (
              freshLandLadders.length === 1 &&
              freshLandLadders[0].success !== undefined &&
              freshLandLadders[0].landLadders
            ) {
              landLaddersData = freshLandLadders[0].landLadders;
            } else {
              landLaddersData = freshLandLadders;
            }
          } else if (freshLandLadders && freshLandLadders.landLadders) {
            landLaddersData = freshLandLadders.landLadders;
          } else {
            landLaddersData = [];
          }
        }

        this.landLadders = {};

        // Create zone ID mapping to handle different zone ID formats
        const zoneIdMapping = {};
        const currentZoneIds = new Set();
        if (this.availableZones && Array.isArray(this.availableZones)) {
          this.availableZones.forEach((zone, index) => {
            const fullZoneId = zone._id || zone.id;
            const simpleZoneId = (index + 1).toString(); // Map to "1", "2", "3", etc.
            if (fullZoneId) {
              currentZoneIds.add(fullZoneId);
              zoneIdMapping[fullZoneId] = simpleZoneId;
              zoneIdMapping[simpleZoneId] = simpleZoneId; // Self-map simple IDs
            }
          });
        }

        console.log('🔍 Zone ID mapping created:', zoneIdMapping);

        if (Array.isArray(landLaddersData)) {
          console.log(
            '🔍 Processing land ladders data:',
            landLaddersData?.length || 0,
            'items',
          );

          landLaddersData.forEach((ladder, index) => {
            console.log(`🔍 Processing ladder ${index}:`, {
              id: ladder.id,
              zoneId: ladder.zoneId,
              zone: ladder.zone,
              tiers: ladder.tiers?.length || 0,
            });

            // Try different ways to get zone ID
            let rawZoneId =
              ladder.zoneId || ladder.zone?.id || ladder.zone || ladder.id;

            // Convert to string for consistent comparison
            const ladderZoneIdStr = String(rawZoneId);

            // Store under the ladder's zone ID
            if (ladderZoneIdStr && ladderZoneIdStr !== 'undefined') {
              this.landLadders[ladderZoneIdStr] = ladder.tiers || [ladder];
            } else {
              console.warn('⚠️ Land ladder missing valid zone ID:', ladder);
            }
          });

          // Now create reverse mappings: map MongoDB ObjectIds to the same ladder data
          // This allows lookups by either MongoDB ObjectId OR simple numeric ID
          Object.entries(zoneIdMapping).forEach(([mongoId, simpleId]) => {
            if (this.landLadders[simpleId] && mongoId !== simpleId) {
              console.log(
                `🔗 Mapping MongoDB zone ID ${mongoId} -> ${simpleId}`,
              );
              this.landLadders[mongoId] = this.landLadders[simpleId];
            }
          });
        }

        console.log('🔍 Land ladders processed:', {
          totalLadders: landLaddersData?.length || 0,
          processedZones: Object.keys(this.landLadders),
          laddersByZone: Object.fromEntries(
            Object.entries(this.landLadders).map(([zone, tiers]) => [
              zone,
              tiers?.length || 0,
            ]),
          ),
        });
      } else {
        console.error('❌ Failed to load land ladders:', results[6].reason);
        this.landLadders = {};
      }

      if (results[7].status === 'fulfilled') {
        // Land use details (index 7)
        const landUseResponse = results[7].value;
        console.log(
          '🔍 Raw land use details response structure:',
          Array.isArray(landUseResponse) ? 'Array' : 'Object',
          landUseResponse,
        );

        if (Array.isArray(landUseResponse)) {
          // Check if this is valid land use data (should have code and displayText fields)
          const hasValidStructure =
            landUseResponse.length > 0 && landUseResponse[0].code !== undefined;

          if (!hasValidStructure && landUseResponse.length > 0) {
            console.warn(
              '❌ Invalid land use data structure detected. Forcing server refresh...',
            );
            // Clear bad cache and force server fetch
            const freshLandUse = await this.assessing.getLandUseDetails(null, {
              forceRefresh: true,
            });
            this.availableLandUseDetails = freshLandUse.landUseDetails || [];
          } else {
            this.availableLandUseDetails = landUseResponse;
          }
        } else if (landUseResponse && landUseResponse.landUseDetails) {
          this.availableLandUseDetails = landUseResponse.landUseDetails;
        } else {
          this.availableLandUseDetails = [];
        }

        console.log(
          '🔍 Land use details loaded:',
          this.availableLandUseDetails?.length || 0,
        );
        if (this.availableLandUseDetails.length > 0) {
          console.log(
            '🔍 First land use item structure:',
            this.availableLandUseDetails[0],
          );
          console.log(
            '🔍 Available land use codes:',
            this.availableLandUseDetails.map((lu) => lu.code),
          );
        }
      } else {
        console.error('❌ Failed to load land use details:', results[7].reason);
        this.availableLandUseDetails = [];
      }

      if (results[8].status === 'fulfilled') {
        // Land taxation categories (index 8)
        const taxationResponse = results[8].value;
        console.log(
          '🔍 Raw taxation categories response structure:',
          Array.isArray(taxationResponse) ? 'Array' : 'Object',
          taxationResponse,
        );

        if (Array.isArray(taxationResponse)) {
          // Check if this is valid taxation category data (should have _id and name fields)
          const hasValidStructure =
            taxationResponse.length > 0 &&
            (taxationResponse[0]._id !== undefined ||
              taxationResponse[0].name !== undefined);

          if (!hasValidStructure && taxationResponse.length > 0) {
            console.warn(
              '❌ Invalid taxation category data structure detected. Forcing server refresh...',
            );
            // Clear bad cache and force server fetch
            const freshTaxation =
              await this.assessing.getLandTaxationCategories(null, {
                forceRefresh: true,
              });
            this.availableTaxationCategories =
              freshTaxation.landTaxationCategories || [];
          } else {
            this.availableTaxationCategories = taxationResponse;
          }
        } else if (
          taxationResponse &&
          taxationResponse.landTaxationCategories
        ) {
          this.availableTaxationCategories =
            taxationResponse.landTaxationCategories;
        } else {
          this.availableTaxationCategories = [];
        }

        console.log(
          '🔍 Taxation categories loaded:',
          this.availableTaxationCategories?.length || 0,
        );
        if (this.availableTaxationCategories.length > 0) {
          console.log(
            '🔍 First taxation category structure:',
            this.availableTaxationCategories[0],
          );
          console.log(
            '🔍 Available taxation category IDs:',
            this.availableTaxationCategories.map((cat) => cat._id),
          );
        }
      } else {
        console.error(
          '❌ Failed to load taxation categories:',
          results[8].reason,
        );
        this.availableTaxationCategories = [];
      }

      if (results[9].status === 'fulfilled') {
        // Current use categories (index 9)
        const currentUseResponse = results[9].value;
        console.log(
          '🔍 Raw current use response structure:',
          Array.isArray(currentUseResponse) ? 'Array' : 'Object',
          currentUseResponse,
        );

        if (Array.isArray(currentUseResponse)) {
          // Check if this is valid current use data (should have code and displayText fields)
          const hasValidStructure =
            currentUseResponse.length > 0 &&
            currentUseResponse[0].code !== undefined;

          if (!hasValidStructure && currentUseResponse.length > 0) {
            console.warn(
              '❌ Invalid current use data structure detected. Forcing server refresh...',
            );
            // Clear bad cache and force server fetch
            const freshCurrentUse = await this.assessing.getCurrentUseSettings(
              null,
              { forceRefresh: true },
            );
            this.availableCurrentUseCategories =
              freshCurrentUse.currentUseCategories || freshCurrentUse || [];
          } else {
            this.availableCurrentUseCategories = currentUseResponse;
          }
        } else if (
          currentUseResponse &&
          currentUseResponse.currentUseCategories
        ) {
          this.availableCurrentUseCategories =
            currentUseResponse.currentUseCategories;
        } else {
          this.availableCurrentUseCategories = [];
        }

        console.log(
          '🔍 Current use categories loaded:',
          this.availableCurrentUseCategories?.length || 0,
        );
        if (this.availableCurrentUseCategories.length > 0) {
          console.log(
            '🔍 First current use item structure:',
            this.availableCurrentUseCategories[0],
          );
          console.log(
            '🔍 Available current use codes:',
            this.availableCurrentUseCategories.map((cu) => cu.code),
          );
        }
      } else {
        console.error(
          '❌ Failed to load current use categories:',
          results[9].reason,
        );
        this.availableCurrentUseCategories = [];
      }

      if (results[10].status === 'fulfilled') {
        // Acreage discount settings (index 10)
        const acreageResponse = results[10].value;
        console.log(
          '🔍 Raw acreage discount response structure:',
          Array.isArray(acreageResponse) ? 'Array' : 'Object',
          acreageResponse,
        );

        if (acreageResponse && acreageResponse.acreageDiscountSettings) {
          this.acreageDiscountSettings =
            acreageResponse.acreageDiscountSettings;
        } else if (acreageResponse && !Array.isArray(acreageResponse)) {
          this.acreageDiscountSettings = acreageResponse;
        } else {
          this.acreageDiscountSettings = null;
        }

        console.log(
          '🔍 Acreage discount settings loaded:',
          this.acreageDiscountSettings,
        );
      } else {
        console.error(
          '❌ Failed to load acreage discount settings:',
          results[10].reason,
        );
        this.acreageDiscountSettings = null;
      }

      // Log summary of loaded data for debugging
      console.log('📊 Land Modal Data Summary:');
      console.log('  Zones:', this.availableZones?.length || 0);
      console.log('  Neighborhoods:', this.availableNeighborhoods?.length || 0);
      console.log('  Site conditions:', this.availableSites?.length || 0);
      console.log('  Driveway types:', this.availableDriveways?.length || 0);
      console.log('  Road types:', this.availableRoads?.length || 0);
      console.log('  Topology:', this.availableTopology?.length || 0);

      // Cache reference data to prevent loss during local-first sync
      this._cachedReferenceData = {
        availableZones: [...(this.availableZones || [])],
        availableNeighborhoods: [...(this.availableNeighborhoods || [])],
        availableSites: [...(this.availableSites || [])],
        availableDriveways: [...(this.availableDriveways || [])],
        availableRoads: [...(this.availableRoads || [])],
        availableTopology: [...(this.availableTopology || [])],
        availableLandUseDetails: [...(this.availableLandUseDetails || [])],
        availableTaxationCategories: [
          ...(this.availableTaxationCategories || []),
        ],
        availableCurrentUseCategories: [
          ...(this.availableCurrentUseCategories || []),
        ],
        acreageDiscountSettings: this.acreageDiscountSettings
          ? { ...this.acreageDiscountSettings }
          : null,
        landLadders: { ...this.landLadders },
      };

      // Initialize shared calculator with reference data
      this.initializeCalculator();
    } catch (error) {
      console.warn('Failed to load municipality reference data:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // Initialize the shared calculator with current reference data
  initializeCalculator() {
    console.log('🔧 Initializing calculator...', {
      zones: this.availableZones?.length || 0,
      landLadders: Object.keys(this.landLadders || {}).length,
      topology: this.availableTopology?.length || 0,
      taxation: this.availableTaxationCategories?.length || 0,
    });

    if (!this.availableZones?.length) {
      console.warn('❌ Calculator initialization failed - no zones available');
      this.calculator = null;
      return;
    }

    const referenceData = {
      landLadders: this.landLadders,
      topologyAttributes: this.availableTopology || [],
      currentUseCategories: this.availableCurrentUseCategories || [],
      landTaxationCategories: this.availableTaxationCategories || [],
      neighborhoodCodes: this.availableNeighborhoods || [],
      siteAttributes: this.availableSites || [],
      drivewayAttributes: this.availableDriveways || [],
      roadAttributes: this.availableRoads || [],
      zones: this.availableZones || [],
      acreageDiscountSettings: this.acreageDiscountSettings,
    };

    this.calculator = new LandAssessmentCalculator(referenceData);
    console.log('✅ Calculator initialized successfully:', !!this.calculator);

    // Mark data as loaded once calculator is ready
    this.isDataLoaded = true;
  }

  // Get complete property assessment with calculated land lines and totals
  get propertyAssessment() {
    if (!this.calculator) {
      // Return default structure while calculator initializes
      return {
        land_use_details: this.landUseEntries,
        calculated_totals: {
          totalAcreage: 0,
          totalFrontage: 0,
          landMarketValue: 0,
          landCurrentUseValue: 0,
          landTaxableValue: 0,
          viewMarketValue: 0,
          viewTaxableValue: 0,
          waterfrontMarketValue: 0,
          waterfrontTaxableValue: 0,
          totalMarketValue: 0,
          totalCurrentUseValue: 0,
          totalCurrentUseCredit: 0,
          totalTaxableValue: 0,
          hasCurrentUseLand: false,
        },
      };
    }

    // Force dependency tracking on the tracked properties
    const landAssessmentData = {
      ...this.landAssessment,
      land_use_details: this.landUseEntries,
    };

    // Include views and waterfronts from the args (passed from controller model)
    const views = this.args.views || [];
    const waterfronts = this.args.waterfronts || [];

    return this.calculator.calculatePropertyAssessment(
      landAssessmentData,
      views,
      waterfronts,
    );
  }

  // Get calculated totals from property assessment
  get calculatedTotals() {
    return this.propertyAssessment.calculated_totals;
  }

  // Get calculated land lines with all values
  get calculatedLandLines() {
    return this.propertyAssessment.land_use_details;
  }

  get totalAcreage() {
    return this.calculatedTotals.totalAcreage;
  }

  get totalMarketValue() {
    return this.calculatedTotals.totalMarketValue;
  }

  get totalAssessedValue() {
    return this.calculatedTotals.totalTaxableValue;
  }

  get totalCurrentUseCredit() {
    return this.calculatedTotals.totalCurrentUseCredit;
  }

  get totalViewValue() {
    return this.calculatedTotals.viewMarketValue;
  }

  // Context-safe getter for market value calculation
  getMarketValue = (entry, index) => {
    if (!this || !this.calculatedLandLines) {
      return 0;
    }
    // Use the same approach as totals - get calculated lines from propertyAssessment
    const calculatedLines = this.calculatedLandLines;
    if (calculatedLines && calculatedLines[index]) {
      const value = calculatedLines[index].marketValue || 0;
      return value;
    }
    return 0;
  };

  // Context-safe getter for current use value calculation
  getCurrentUseValue = (entry, index) => {
    if (!this || !this.calculatedLandLines) {
      return 0;
    }
    // Use the same approach as totals - get calculated lines from propertyAssessment
    const calculatedLines = this.calculatedLandLines;
    if (calculatedLines && calculatedLines[index]) {
      const value = calculatedLines[index].currentUseValue || 0;
      return value;
    }
    return 0;
  };

  // Context-safe getter for assessed value calculation
  getAssessedValue = (entry, index) => {
    if (!this || !this.calculatedLandLines) {
      return 0;
    }
    // Use the same approach as totals - get calculated lines from propertyAssessment
    const calculatedLines = this.calculatedLandLines;
    if (calculatedLines && calculatedLines[index]) {
      const value = calculatedLines[index].assessedValue || 0;
      return value;
    }
    return 0;
  };

  _restoreFromCache() {
    if (!this._cachedReferenceData) {
      return false;
    }

    try {
      this.availableZones = [...this._cachedReferenceData.availableZones];
      this.availableNeighborhoods = [
        ...this._cachedReferenceData.availableNeighborhoods,
      ];
      this.availableSites = [...this._cachedReferenceData.availableSites];
      this.availableDriveways = [
        ...this._cachedReferenceData.availableDriveways,
      ];
      this.availableRoads = [...this._cachedReferenceData.availableRoads];
      this.availableTopology = [...this._cachedReferenceData.availableTopology];
      this.availableLandUseDetails = [
        ...this._cachedReferenceData.availableLandUseDetails,
      ];
      this.availableTaxationCategories = [
        ...this._cachedReferenceData.availableTaxationCategories,
      ];
      this.availableCurrentUseCategories = [
        ...this._cachedReferenceData.availableCurrentUseCategories,
      ];
      this.acreageDiscountSettings = this._cachedReferenceData
        .acreageDiscountSettings
        ? { ...this._cachedReferenceData.acreageDiscountSettings }
        : null;
      this.landLadders = { ...this._cachedReferenceData.landLadders };

      // Reinitialize calculator with restored data
      this.initializeCalculator();

      this.isDataLoaded = true;
      return true;
    } catch (error) {
      console.error('Failed to restore from cache:', error);
      return false;
    }
  }

  // Helper methods for factor calculations (used by both old and new systems)
  getSiteFactor(siteConditionsId) {
    const siteAttribute = this.availableSites?.find(
      (s) => s._id === siteConditionsId || s.id === siteConditionsId,
    );
    return siteAttribute
      ? siteAttribute.rate
        ? siteAttribute.rate / 100
        : 1
      : 1.0;
  }

  getDrivewayFactor(drivewayTypeId) {
    const drivewayAttribute = this.availableDriveways?.find(
      (d) => d._id === drivewayTypeId || d.id === drivewayTypeId,
    );
    return drivewayAttribute
      ? drivewayAttribute.rate
        ? drivewayAttribute.rate / 100
        : 1
      : 1.0;
  }

  getRoadFactor(roadTypeId) {
    const roadAttribute = this.availableRoads?.find(
      (r) => r._id === roadTypeId || r.id === roadTypeId,
    );
    return roadAttribute
      ? roadAttribute.rate
        ? roadAttribute.rate / 100
        : 1
      : 1.0;
  }

  @action
  updateLandAssessment(field, value) {
    this.landAssessment = { ...this.landAssessment, [field]: value };
  }

  @action
  updateLandAssessmentFromEvent(field, event) {
    this.updateLandAssessment(field, event.target.value);
  }

  @action
  addLandUseEntry() {
    this.landUseEntries = [
      ...this.landUseEntries,
      {
        id: `temp_${Date.now()}_${Math.random()}`, // Add unique ID for stable keys
        land_use_type: '',
        size: '',
        size_unit: 'AC',
        topography: '',
        condition: '',
        spi: '',
        is_excess_acreage: false,
        notes: '',
      },
    ];
  }

  @action
  removeLandUseEntry(index) {
    this.landUseEntries = this.landUseEntries.filter((_, i) => i !== index);
  }

  @action
  updateLandUseEntry(index, field, value) {
    this.landUseEntries = this.landUseEntries.map((entry, i) => {
      if (i === index) {
        return { ...entry, [field]: value };
      }
      return entry;
    });
  }

  @action
  updateLandUseEntryFromEvent(index, field, event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value;

    // Special handling for land_use_type - set both ID and legacy string
    if (field === 'land_use_type') {
      const selectedId = value;
      // Find the land use detail by ID
      const landUseDetail = this.availableLandUseDetails?.find(
        (lu) => lu._id === selectedId,
      );
      // Find in current use categories if not found in land use details
      const currentUse = !landUseDetail
        ? this.availableCurrentUseCategories?.find(
            (cu) => cu._id === selectedId,
          )
        : null;

      const selectedItem = landUseDetail || currentUse;

      if (selectedItem) {
        // Update both the ObjectId reference and the legacy string
        this.landUseEntries = this.landUseEntries.map((entry, i) => {
          if (i === index) {
            return {
              ...entry,
              land_use_detail_id: selectedItem._id,
              land_use_type: selectedItem.code || selectedItem.displayText,
            };
          }
          return entry;
        });
        return;
      }
    }

    // Special handling for topography - set both ID and legacy string
    if (field === 'topography') {
      const selectedId = value;
      // Find the topology attribute by ID
      const topologyAttr = this.availableTopology?.find(
        (t) => t._id === selectedId,
      );

      if (topologyAttr) {
        // Update both the ObjectId reference and the legacy string
        this.landUseEntries = this.landUseEntries.map((entry, i) => {
          if (i === index) {
            return {
              ...entry,
              topography_id: topologyAttr._id,
              topography: topologyAttr.displayText,
            };
          }
          return entry;
        });
        return;
      }
    }

    // Default handling for other fields
    this.updateLandUseEntry(index, field, value);
  }

  @action
  async saveLandAssessment() {
    if (this.isSaving) return;

    try {
      this.isSaving = true;

      const propertyId = this.args.property.id;

      // Ensure reference data is loaded before calculating values
      if (
        !this.availableZones ||
        !this.availableNeighborhoods ||
        !this.landLadders
      ) {
        if (!this._restoreFromCache()) {
          await this.loadMunicipalityOptions();
        }
      }

      // Ensure calculator is initialized before saving
      if (!this.calculator) {
        this.initializeCalculator();
      }

      // Use the complete calculated property assessment
      const propertyAssessment = this.propertyAssessment;

      // Only save ObjectIds - display names will be populated on GET
      const payload = {
        ...this.landAssessment,
        land_use_details: propertyAssessment.land_use_details,
        calculated_totals: propertyAssessment.calculated_totals,
        market_value: this.totalMarketValue,
        taxable_value: this.totalAssessedValue,
      };

      // Land assessment is parcel-level, not card-specific
      await this.assessing.updateLandAssessment(propertyId, payload);

      // After successful save, the assessing service will update cache with fresh property data
      // Just notify other users of the update
      this.propertyCache.notifyPropertyUpdate(
        propertyId,
        1,
        null,
        'land-update',
      );

      this.args.onSave?.();
      this.args.onClose?.();
    } catch (error) {
      console.error('Failed to save land assessment:', error);
      alert('Failed to save land assessment');
    } finally {
      this.isSaving = false;
    }
  }

  @action
  cancelEdit() {
    this.args.onClose?.();
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
