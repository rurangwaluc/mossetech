export const db = {
  async transaction() {
    throw new Error('DATABASE_ACCESS_BLOCKED');
  },
};
