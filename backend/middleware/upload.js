// // backend/middleware/upload.js
import multer from "multer";
import path from "path";
import multerS3 from "multer-s3";
import { S3Client } from "@aws-sdk/client-s3";

let storageImages;
let storagePDFs;

// -----------------------------
// S3 CONFIG
// -----------------------------
let s3 = null;
const useS3 =
  process.env.S3_BUCKET &&
  process.env.AWS_REGION &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY;

if (useS3) {
  s3 = new S3Client({ region: process.env.AWS_REGION });

  // IMAGES STORAGE ON S3
  storageImages = multerS3({
    s3,
    bucket: process.env.S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    acl: "public-read",
    key: (req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, `images/${file.fieldname}-${unique}${path.extname(file.originalname)}`);
    },
  });

  // PDF STORAGE ON S3
  storagePDFs = multerS3({
    s3,
    bucket: process.env.S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    acl: "public-read",
    key: (req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, `pdfs/${file.fieldname}-${unique}${path.extname(file.originalname)}`);
    }
  });

} else {
  // LOCAL STORAGE FOR IMAGES
  storageImages = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "uploads/images");
    },
    filename: (req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, `${file.fieldname}-${unique}${path.extname(file.originalname)}`);
    },
  });

  // LOCAL STORAGE FOR PDFs
  storagePDFs = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "uploads/pdfs");
    },
    filename: (req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, `${file.fieldname}-${unique}${path.extname(file.originalname)}`);
    },
  });
}

// ------------------------------------
// IMAGE FILTER
// ------------------------------------
const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) cb(null, true);
  else cb(new Error("Only image files allowed"), false);
};

// ------------------------------------
// PDF FILTER
// ------------------------------------
const pdfFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") cb(null, true);
  else cb(new Error("Only PDF files allowed"), false);
};

// ------------------------------------
// MULTER EXPORTS
// ------------------------------------
export const uploadImage = multer({
  storage: storageImages,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadPDF = multer({
  storage: storagePDFs,
  fileFilter: pdfFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB PDF
});
















// import multer from "multer";
// import path from "path";
// import multerS3 from "multer-s3";
// import { S3Client } from "@aws-sdk/client-s3";

// let storage;
// if (process.env.S3_BUCKET && process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
//   const s3 = new S3Client({ region: process.env.AWS_REGION });
//   storage = multerS3({
//     s3,
//     bucket: process.env.S3_BUCKET,
//     contentType: multerS3.AUTO_CONTENT_TYPE,
//     acl: 'public-read',
//     key: (req, file, cb) => {
//       const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
//       cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
//     }
//   });
// } else {
//   storage = multer.diskStorage({
//     destination: (req, file, cb) => {
//       cb(null, "uploads/");
//     },
//     filename: (req, file, cb) => {
//       const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
//       cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
//     },
//   });
// }

// const fileFilter = (req, file, cb) => {
//   if (file.mimetype.startsWith("image/")) {
//     cb(null, true);
//   } else {
//     cb(new Error("Only image files are allowed!"), false);
//   }
// };

// const upload = multer({
//   storage: storage,
//   fileFilter: fileFilter,
//   limits: {
//     fileSize: 5 * 1024 * 1024, // 5MB limit
//   },
// });

// export default upload;
