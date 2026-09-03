import { File } from "expo-file-system";

export async function readCapturedCardBytes(uri: string): Promise<ArrayBuffer> {
  if (uri.startsWith("data:") || uri.startsWith("blob:")) {
    return (await fetch(uri)).arrayBuffer();
  }

  if (!uri.includes(":")) {
    return (await fetch(`data:image/jpeg;base64,${uri}`)).arrayBuffer();
  }

  return new File(uri).arrayBuffer();
}
