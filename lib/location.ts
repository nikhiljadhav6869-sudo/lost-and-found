export type MapPoint = {latitude:number;longitude:number};
export function approximateLocation(latitude:number,longitude:number) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) throw Error('Invalid location');
    // Only the rounded public area is saved; the precise device fix is discarded.
    return `Near ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
}
export function locationPoint(value:string): MapPoint | null {
    const match=/^Near (-?\d{1,2}\.\d{3}), (-?\d{1,3}\.\d{3})$/.exec(value.trim());
    if(!match)return null;
    const latitude=Number(match[1]),longitude=Number(match[2]);
    return Math.abs(latitude)<=90 && Math.abs(longitude)<=180 ? {latitude,longitude} : null;
}
export function googleMapsUrl(value:string) {
    const point=locationPoint(value);
    const query=point?`${point.latitude},${point.longitude}`:value.trim();
    return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query);
}
export function distanceKm(a:MapPoint,b:MapPoint) {
    const rad=(n:number)=>n*Math.PI/180;
    const h=Math.sin(rad(b.latitude-a.latitude)/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2)**2;
    return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
