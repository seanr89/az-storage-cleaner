import type { FileInfo } from "./models/Fileinfo";
import { createObjectCsvWriter } from "csv-writer";

export async function writeToCsv(fileInfo: FileInfo[], fileName: string): Promise<void> {
  const csvWriter = createObjectCsvWriter({
    path: `./output/${fileName}`,
    header: [
      { id: "name", title: "Name" },
      { id: "lastModified", title: "Last Modified" },
    ],
  });

  await csvWriter.writeRecords(fileInfo);
}

export async function writeToJson(fileInfo: FileInfo[], fileName: string): Promise<void> {
    const jsonContent = JSON.stringify(fileInfo, null, 2);
    await Bun.write(`./output/${fileName}`, jsonContent);
}
