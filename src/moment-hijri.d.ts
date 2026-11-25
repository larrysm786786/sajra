declare module "moment-hijri" {
  interface HijriMoment {
    iDate(): number;
    iMonth(): number;
    iYear(): number;
  }

  function momentHijri(input?: Date | string | number): HijriMoment;
  export default momentHijri;
}
