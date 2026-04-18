interface RuntimeWithClosableDatabase {
  database: {
    closeAsync?: () => Promise<void>;
  };
}

export async function closeRuntimeIfInactive(
  runtime: RuntimeWithClosableDatabase,
  isActive: boolean,
): Promise<boolean> {
  if (isActive) {
    return false;
  }

  await runtime.database.closeAsync?.();
  return true;
}
