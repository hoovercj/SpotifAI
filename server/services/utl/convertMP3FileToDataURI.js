const fs = require("fs");

const MIME_TYPES = {
  png: "image/png",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

async function convertFileToDataURI(filePath, fileType) {
  try {
    const fileData = await fs.promises.readFile(filePath);
    const base64Data = fileData.toString("base64");
    const mimeType = MIME_TYPES[fileType];
    if (!mimeType) {
      throw new Error(`Unsupported file type: ${fileType}`);
    }

    const dataURI = `data:${mimeType};base64,${base64Data}`;
    return dataURI;
  } catch (error) {
    console.error("Error:", error.message);
  }
}

module.exports = {
  convertFileToDataURI,
};
