// EZD-711 (phase-07 EZD-711 "Tests use a recorded PAO page saved in fixtures and the stub AI response"): a recorded
// Palm Beach County property appraiser parcel page, reduced to the parts the read uses. Synthetic test data in the
// site's layout (no real owner): the values match the stub AI reply in
// server/jobs/ai-purposes/property-appraiser-recording.ts.
export const PBC_FIXTURE_URL = 'https://pbcpao.gov/Property/Details?parcelId=00434421010000010';

export const PBC_FIXTURE_FIELDS = {
  parcelNo: '00-43-44-21-01-000-0010',
  owner: 'HENDRICKS FAMILY TRUST',
  legalDescription: 'GOLFVIEW HEIGHTS LT 10 BLK 2',
  yearBuilt: 1975,
  livingArea: 2140,
} as const;

export const PBC_FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Property Detail | Palm Beach County Property Appraiser</title>
<style>.label{font-weight:bold}</style>
<script>window.analytics = { page: 'detail' };</script>
</head>
<body>
<header><nav><a href="/">Home</a> &gt; <a href="/Property/Search">Property Search</a></nav></header>
<main>
<h1>Property Detail</h1>
<section id="propertyDetail">
<table>
<tr><td class="label">Location Address</td><td>336 GOLFVIEW RD</td></tr>
<tr><td class="label">Municipality</td><td>NORTH PALM BEACH</td></tr>
<tr><td class="label">Parcel Control Number</td><td>00-43-44-21-01-000-0010</td></tr>
<tr><td class="label">Subdivision</td><td>GOLFVIEW HEIGHTS</td></tr>
<tr><td class="label">Legal Description</td><td>GOLFVIEW HEIGHTS LT 10 BLK 2</td></tr>
</table>
</section>
<section id="ownerInformation">
<h2>Owner Information</h2>
<table><tr><td class="label">Owner(s)</td><td>HENDRICKS FAMILY TRUST</td></tr></table>
</section>
<section id="structuralDetails">
<h2>Structural Details</h2>
<table>
<tr><td class="label">Year Built</td><td>1975</td></tr>
<tr><td class="label">Total Square Feet</td><td>2,612</td></tr>
<tr><td class="label">Living Area (SF)</td><td>2,140</td></tr>
<tr><td class="label">Bedrooms</td><td>3</td></tr>
</table>
</section>
</main>
<footer>&copy; Palm Beach County Property Appraiser</footer>
</body>
</html>
`;
