// Cliente de la API de registros (fetch al App Router).

async function handle(res) {
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json();
}

export async function fetchRecords() {
  const res = await fetch("/api/records", { cache: "no-store" });
  return handle(res);
}

export async function createRecordApi(data) {
  const res = await fetch("/api/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateRecordApi(id, data) {
  const res = await fetch(`/api/records/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function patchRecordApi(id, partial) {
  const res = await fetch(`/api/records/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  });
  return handle(res);
}

export async function deleteRecordApi(id) {
  const res = await fetch(`/api/records/${id}`, { method: "DELETE" });
  return handle(res);
}
