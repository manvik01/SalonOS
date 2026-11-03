export const ids = {
  tenantA: 'a0a0a0a0-a0a0-40a0-80a0-00000000000a',
  tenantB: 'b0b0b0b0-b0b0-40b0-80b0-00000000000b',
  ownerA: 'a0a0a0a0-a0a0-40a0-80a0-0000000000a1',
  deskA: 'a0a0a0a0-a0a0-40a0-80a0-0000000000a2',
  ownerB: 'b0b0b0b0-b0b0-40b0-80b0-0000000000b1',
  deskB: 'b0b0b0b0-b0b0-40b0-80b0-0000000000b2',
  location: '11111111-1111-4111-8111-111111111111',
  alice: '22222222-2222-4222-8222-222222222201',
  bob: '22222222-2222-4222-8222-222222222202',
  room: '33333333-3333-4333-8333-333333333333',
  cut: '44444444-4444-4444-8444-444444444401',
  wash: '44444444-4444-4444-8444-444444444402',
  client: '55555555-5555-4555-8555-555555555555',
  noteA: '66666666-6666-4666-8666-66666666666a',
};

export const PASSWORD = 'synthetic-test-password';
export const time = hour => `2026-11-10T${hour}:00:00Z`;
export const bookingRequest = (start = time('09'), staffId = ids.alice) => ({
  clientId: ids.client,
  start,
  items: [{ serviceId: ids.cut, staffId, resourceId: ids.room }],
});
