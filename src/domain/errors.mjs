export class BookingError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const fail = (code, message) => {
  throw new BookingError(code, message);
};
