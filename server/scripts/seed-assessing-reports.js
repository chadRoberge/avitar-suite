const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/../.env' });

const AssessingReport = require('../models/AssessingReport');
const Municipality = require('../models/Municipality');
const User = require('../models/User');

// Connect to MongoDB
mongoose.connect(
  process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-suite',
);

const sampleReports = [
  {
    module: 'assessing',
    name: 'property_assessment_summary',
    display_name: 'Property Assessment Summary',
    description:
      'Comprehensive summary of property assessments including statistics, breakdowns by property class, and detailed property listings.',
    component_name: 'property-assessment-summary',
    category: 'assessment',
    parameters: [
      {
        name: 'assessment_year',
        display_name: 'Assessment Year',
        type: 'year',
        required: true,
        default_value: new Date().getFullYear(),
      },
      {
        name: 'property_class',
        display_name: 'Property Class',
        type: 'select',
        required: false,
        default_value: 'all',
        options: [
          { value: 'all', label: 'All Property Classes' },
          { value: 'residential', label: 'Residential' },
          { value: 'commercial', label: 'Commercial' },
          { value: 'industrial', label: 'Industrial' },
          { value: 'public_utility', label: 'Public Utility' },
        ],
      },
      {
        name: 'zone',
        display_name: 'Zone',
        type: 'select',
        required: false,
        default_value: 'all',
        options: [{ value: 'all', label: 'All Zones' }],
      },
      {
        name: 'include_exemptions',
        display_name: 'Include Exemptions',
        type: 'boolean',
        required: false,
        default_value: false,
      },
    ],
    output_formats: ['pdf', 'excel', 'csv'],
    permissions: {
      required_roles: ['admin', 'assessor'],
      required_permissions: ['view_assessments'],
    },
    sort_order: 1,
    execution_settings: {
      timeout_minutes: 15,
      max_records: 50000,
      cache_duration_minutes: 30,
    },
  },
  {
    module: 'assessing',
    name: 'exemption_analysis',
    display_name: 'Exemption Analysis Report',
    description:
      'Detailed analysis of exemptions and credits including trends, impacts, and statistical breakdowns.',
    component_name: 'exemption-analysis',
    category: 'exemption',
    parameters: [
      {
        name: 'assessment_year',
        display_name: 'Assessment Year',
        type: 'year',
        required: true,
        default_value: new Date().getFullYear(),
      },
      {
        name: 'exemption_types',
        display_name: 'Exemption Types',
        type: 'multiselect',
        required: false,
        options: [],
      },
      {
        name: 'include_historical',
        display_name: 'Include Historical Data',
        type: 'boolean',
        required: false,
        default_value: true,
      },
      {
        name: 'comparison_years',
        display_name: 'Comparison Years',
        type: 'number',
        required: false,
        default_value: 3,
        validation: {
          min: 1,
          max: 10,
        },
      },
    ],
    output_formats: ['pdf', 'excel'],
    permissions: {
      required_roles: ['admin', 'assessor'],
      required_permissions: ['view_exemptions'],
    },
    sort_order: 2,
    execution_settings: {
      timeout_minutes: 10,
      max_records: 25000,
      cache_duration_minutes: 60,
    },
  },
  {
    module: 'assessing',
    name: 'assessment_roll',
    display_name: 'Assessment Roll',
    description:
      'Official assessment roll for a specific assessment year with all property valuations.',
    component_name: 'assessment-roll',
    category: 'assessment',
    parameters: [
      {
        name: 'assessment_year',
        display_name: 'Assessment Year',
        type: 'year',
        required: true,
        default_value: new Date().getFullYear(),
      },
      {
        name: 'include_owner_info',
        display_name: 'Include Owner Information',
        type: 'boolean',
        required: false,
        default_value: true,
      },
      {
        name: 'sort_by',
        display_name: 'Sort By',
        type: 'select',
        required: false,
        default_value: 'property_id',
        options: [
          { value: 'property_id', label: 'Property ID' },
          { value: 'owner_name', label: 'Owner Name' },
          { value: 'location', label: 'Location' },
          { value: 'assessed_value', label: 'Assessed Value' },
        ],
      },
    ],
    output_formats: ['pdf', 'excel', 'csv'],
    permissions: {
      required_roles: ['admin', 'assessor'],
      required_permissions: ['view_assessments'],
    },
    sort_order: 3,
    execution_settings: {
      timeout_minutes: 20,
      max_records: 100000,
      cache_duration_minutes: 120,
    },
  },
  {
    module: 'assessing',
    name: 'tax_impact_analysis',
    display_name: 'Tax Impact Analysis',
    description:
      'Analysis of tax impacts from assessment changes and exemptions.',
    component_name: 'tax-impact-analysis',
    category: 'tax',
    parameters: [
      {
        name: 'base_year',
        display_name: 'Base Year',
        type: 'year',
        required: true,
        default_value: new Date().getFullYear() - 1,
      },
      {
        name: 'comparison_year',
        display_name: 'Comparison Year',
        type: 'year',
        required: true,
        default_value: new Date().getFullYear(),
      },
      {
        name: 'tax_rate',
        display_name: 'Tax Rate (per $1000)',
        type: 'number',
        required: true,
        validation: {
          min: 0,
          max: 100,
        },
      },
    ],
    output_formats: ['pdf', 'excel'],
    permissions: {
      required_roles: ['admin', 'assessor'],
      required_permissions: ['view_assessments', 'view_tax_data'],
    },
    sort_order: 4,
    execution_settings: {
      timeout_minutes: 15,
      max_records: 75000,
      cache_duration_minutes: 45,
    },
  },
  {
    module: 'assessing',
    name: 'property_sales_analysis',
    display_name: 'Property Sales Analysis',
    description:
      'Analysis of property sales data and assessment ratios for market validation.',
    component_name: 'property-sales-analysis',
    category: 'analysis',
    parameters: [
      {
        name: 'sale_date_from',
        display_name: 'Sale Date From',
        type: 'date',
        required: true,
      },
      {
        name: 'sale_date_to',
        display_name: 'Sale Date To',
        type: 'date',
        required: true,
      },
      {
        name: 'property_class',
        display_name: 'Property Class',
        type: 'select',
        required: false,
        default_value: 'all',
        options: [
          { value: 'all', label: 'All Property Classes' },
          { value: 'residential', label: 'Residential' },
          { value: 'commercial', label: 'Commercial' },
        ],
      },
      {
        name: 'minimum_sale_price',
        display_name: 'Minimum Sale Price',
        type: 'number',
        required: false,
        default_value: 10000,
        validation: {
          min: 0,
        },
      },
    ],
    output_formats: ['pdf', 'excel'],
    permissions: {
      required_roles: ['admin', 'assessor'],
      required_permissions: ['view_sales_data'],
    },
    sort_order: 5,
    execution_settings: {
      timeout_minutes: 12,
      max_records: 30000,
      cache_duration_minutes: 90,
    },
  },
  {
    module: 'assessing',
    name: 'parcel_count',
    display_name: 'Parcel Count Report',
    description:
      'Comprehensive parcel count and assessed value statistics by property classification including residential, commercial, manufactured housing, and utility properties.',
    component_name: 'parcel-count',
    category: 'assessment',
    parameters: [
      {
        name: 'assessment_year',
        display_name: 'Assessment Year',
        type: 'year',
        required: true,
        default_value: new Date().getFullYear(),
      },
      {
        name: 'include_exempt_properties',
        display_name: 'Include Exempt Properties',
        type: 'boolean',
        required: false,
        default_value: true,
      },
      {
        name: 'dra_certification_year',
        display_name: 'DRA Certification Year',
        type: 'year',
        required: false,
        default_value: new Date().getFullYear(),
      },
    ],
    output_formats: ['pdf', 'excel'],
    permissions: {
      required_roles: ['admin', 'assessor'],
      required_permissions: ['view_assessments'],
    },
    sort_order: 6,
    execution_settings: {
      timeout_minutes: 10,
      max_records: 100000,
      cache_duration_minutes: 30,
    },
  },
];

async function seedAssessingReports() {
  try {
    console.log('Starting to seed assessing reports...');

    // Get a system user for created_by field
    const systemUser =
      (await User.findOne({ userType: 'system' })) ||
      (await User.findOne({}).sort({ created_at: 1 }));

    if (!systemUser) {
      throw new Error('No user found for created_by field');
    }

    // Create global reports first
    let createdReports = [];
    for (const reportTemplate of sampleReports) {
      try {
        // Check if global report already exists
        const existingReport = await AssessingReport.findOne({
          component_name: reportTemplate.component_name,
          module: reportTemplate.module,
        });

        if (existingReport) {
          console.log(
            `  Global report "${reportTemplate.name}" already exists, using existing`,
          );
          createdReports.push(existingReport);
          continue;
        }

        // Create new global report
        const newReport = new AssessingReport({
          ...reportTemplate,
          created_by: systemUser._id,
          is_active: true,
        });

        await newReport.save();
        createdReports.push(newReport);
        console.log(`  Created global report: ${reportTemplate.display_name}`);
      } catch (error) {
        console.error(
          `  Failed to create report "${reportTemplate.name}":`,
          error.message,
        );
      }
    }

    // Get all municipalities and assign reports to them
    const municipalities = await Municipality.find({});
    console.log(`Found ${municipalities.length} municipalities`);

    let totalAssigned = 0;
    for (const municipality of municipalities) {
      console.log(`Assigning reports to municipality: ${municipality.name}`);

      // Get existing available reports for assessing module
      const existingAssessingReports =
        municipality.available_reports.get('assessing') || [];
      const existingReportIds = existingAssessingReports.map((id) =>
        id.toString(),
      );

      // Add new report IDs
      const newReportIds = createdReports
        .filter((report) => !existingReportIds.includes(report._id.toString()))
        .map((report) => report._id);

      if (newReportIds.length > 0) {
        const allReportIds = [...existingAssessingReports, ...newReportIds];
        municipality.available_reports.set('assessing', allReportIds);
        await municipality.save();
        totalAssigned += newReportIds.length;
        console.log(
          `  Assigned ${newReportIds.length} reports to ${municipality.name}`,
        );
      } else {
        console.log(`  No new reports to assign to ${municipality.name}`);
      }
    }

    console.log(
      `\n✅ Successfully created ${createdReports.length} global reports`,
    );
    console.log(
      `✅ Successfully assigned ${totalAssigned} reports to municipalities`,
    );
    console.log(
      `📊 Sample reports are now available in the Assessing > Reports section`,
    );
  } catch (error) {
    console.error('❌ Error seeding assessing reports:', error);
    throw error;
  }
}

async function main() {
  try {
    await seedAssessingReports();
    console.log('\n🎉 Assessing reports seeding completed successfully!');
  } catch (error) {
    console.error('\n💥 Seeding failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { seedAssessingReports };
