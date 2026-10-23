/** Updates move markers, but only the first fix or an explicit request moves the camera. */
export function shouldCenterHeader(centered: boolean, explored: boolean, previousRequest: number, request: number) {
  return request !== previousRequest || (!centered && !explored);
}
