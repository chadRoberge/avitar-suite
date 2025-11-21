const mongoose = require('mongoose');

const permitCommentSchema = new mongoose.Schema(
  {
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      index: true,
    },
    permitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permit',
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    visibility: {
      type: String,
      enum: ['private', 'internal', 'public'],
      default: 'internal',
      required: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    authorName: {
      type: String,
      required: true,
    },
    attachments: [
      {
        fileId: mongoose.Schema.Types.ObjectId,
        fileName: String,
        fileUrl: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
permitCommentSchema.index({ municipalityId: 1, permitId: 1, createdAt: -1 });
permitCommentSchema.index({ authorId: 1 });

const PermitComment = mongoose.model('PermitComment', permitCommentSchema);

module.exports = PermitComment;
