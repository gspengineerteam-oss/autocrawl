// ISO 3166-1 country lookup + flag emoji helper.
//
// Backend emits a free-form `country` string per row (vendors, expos, world map
// points). resolveCountry() normalizes that string into a canonical record:
// English name, alpha-2, alpha-3, and an approximate centroid (lat/lon) used
// to plot map points. Centroids are visual, not population-weighted.
//
// Matching order: alpha-2 → alpha-3 → exact lowercased name → alias table
// (covers common English nicknames, Indonesian translations from the NLLB
// pipeline, and a few historical names that still show up in scraped pages).

export interface CountryRecord {
  name: string
  cca2: string
  cca3: string
  lat: number
  lon: number
}

// prettier-ignore
const COUNTRIES: ReadonlyArray<CountryRecord> = [
  { name: 'Afghanistan', cca2: 'AF', cca3: 'AFG', lat: 33.93911, lon: 67.709953 },
  { name: 'Albania', cca2: 'AL', cca3: 'ALB', lat: 41.153332, lon: 20.168331 },
  { name: 'Algeria', cca2: 'DZ', cca3: 'DZA', lat: 28.033886, lon: 1.659626 },
  { name: 'Andorra', cca2: 'AD', cca3: 'AND', lat: 42.546245, lon: 1.601554 },
  { name: 'Angola', cca2: 'AO', cca3: 'AGO', lat: -11.202692, lon: 17.873887 },
  { name: 'Antigua and Barbuda', cca2: 'AG', cca3: 'ATG', lat: 17.060816, lon: -61.796428 },
  { name: 'Argentina', cca2: 'AR', cca3: 'ARG', lat: -38.416097, lon: -63.616672 },
  { name: 'Armenia', cca2: 'AM', cca3: 'ARM', lat: 40.069099, lon: 45.038189 },
  { name: 'Australia', cca2: 'AU', cca3: 'AUS', lat: -25.274398, lon: 133.775136 },
  { name: 'Austria', cca2: 'AT', cca3: 'AUT', lat: 47.516231, lon: 14.550072 },
  { name: 'Azerbaijan', cca2: 'AZ', cca3: 'AZE', lat: 40.143105, lon: 47.576927 },
  { name: 'Bahamas', cca2: 'BS', cca3: 'BHS', lat: 25.03428, lon: -77.39628 },
  { name: 'Bahrain', cca2: 'BH', cca3: 'BHR', lat: 25.930414, lon: 50.637772 },
  { name: 'Bangladesh', cca2: 'BD', cca3: 'BGD', lat: 23.684994, lon: 90.356331 },
  { name: 'Barbados', cca2: 'BB', cca3: 'BRB', lat: 13.193887, lon: -59.543198 },
  { name: 'Belarus', cca2: 'BY', cca3: 'BLR', lat: 53.709807, lon: 27.953389 },
  { name: 'Belgium', cca2: 'BE', cca3: 'BEL', lat: 50.503887, lon: 4.469936 },
  { name: 'Belize', cca2: 'BZ', cca3: 'BLZ', lat: 17.189877, lon: -88.49765 },
  { name: 'Benin', cca2: 'BJ', cca3: 'BEN', lat: 9.30769, lon: 2.315834 },
  { name: 'Bhutan', cca2: 'BT', cca3: 'BTN', lat: 27.514162, lon: 90.433601 },
  { name: 'Bolivia', cca2: 'BO', cca3: 'BOL', lat: -16.290154, lon: -63.588653 },
  { name: 'Bosnia and Herzegovina', cca2: 'BA', cca3: 'BIH', lat: 43.915886, lon: 17.679076 },
  { name: 'Botswana', cca2: 'BW', cca3: 'BWA', lat: -22.328474, lon: 24.684866 },
  { name: 'Brazil', cca2: 'BR', cca3: 'BRA', lat: -14.235004, lon: -51.92528 },
  { name: 'Brunei', cca2: 'BN', cca3: 'BRN', lat: 4.535277, lon: 114.727669 },
  { name: 'Bulgaria', cca2: 'BG', cca3: 'BGR', lat: 42.733883, lon: 25.48583 },
  { name: 'Burkina Faso', cca2: 'BF', cca3: 'BFA', lat: 12.238333, lon: -1.561593 },
  { name: 'Burundi', cca2: 'BI', cca3: 'BDI', lat: -3.373056, lon: 29.918886 },
  { name: 'Cabo Verde', cca2: 'CV', cca3: 'CPV', lat: 16.002082, lon: -24.013197 },
  { name: 'Cambodia', cca2: 'KH', cca3: 'KHM', lat: 12.565679, lon: 104.990963 },
  { name: 'Cameroon', cca2: 'CM', cca3: 'CMR', lat: 7.369722, lon: 12.354722 },
  { name: 'Canada', cca2: 'CA', cca3: 'CAN', lat: 56.130366, lon: -106.346771 },
  { name: 'Central African Republic', cca2: 'CF', cca3: 'CAF', lat: 6.611111, lon: 20.939444 },
  { name: 'Chad', cca2: 'TD', cca3: 'TCD', lat: 15.454166, lon: 18.732207 },
  { name: 'Chile', cca2: 'CL', cca3: 'CHL', lat: -35.675147, lon: -71.542969 },
  { name: 'China', cca2: 'CN', cca3: 'CHN', lat: 35.86166, lon: 104.195397 },
  { name: 'Colombia', cca2: 'CO', cca3: 'COL', lat: 4.570868, lon: -74.297333 },
  { name: 'Comoros', cca2: 'KM', cca3: 'COM', lat: -11.875001, lon: 43.872219 },
  { name: 'Congo', cca2: 'CG', cca3: 'COG', lat: -0.228021, lon: 15.827659 },
  { name: 'Congo (DRC)', cca2: 'CD', cca3: 'COD', lat: -4.038333, lon: 21.758664 },
  { name: 'Costa Rica', cca2: 'CR', cca3: 'CRI', lat: 9.748917, lon: -83.753428 },
  { name: "Côte d'Ivoire", cca2: 'CI', cca3: 'CIV', lat: 7.539989, lon: -5.54708 },
  { name: 'Croatia', cca2: 'HR', cca3: 'HRV', lat: 45.1, lon: 15.2 },
  { name: 'Cuba', cca2: 'CU', cca3: 'CUB', lat: 21.521757, lon: -77.781167 },
  { name: 'Cyprus', cca2: 'CY', cca3: 'CYP', lat: 35.126413, lon: 33.429859 },
  { name: 'Czechia', cca2: 'CZ', cca3: 'CZE', lat: 49.817492, lon: 15.472962 },
  { name: 'Denmark', cca2: 'DK', cca3: 'DNK', lat: 56.26392, lon: 9.501785 },
  { name: 'Djibouti', cca2: 'DJ', cca3: 'DJI', lat: 11.825138, lon: 42.590275 },
  { name: 'Dominica', cca2: 'DM', cca3: 'DMA', lat: 15.414999, lon: -61.370976 },
  { name: 'Dominican Republic', cca2: 'DO', cca3: 'DOM', lat: 18.735693, lon: -70.162651 },
  { name: 'Ecuador', cca2: 'EC', cca3: 'ECU', lat: -1.831239, lon: -78.183406 },
  { name: 'Egypt', cca2: 'EG', cca3: 'EGY', lat: 26.820553, lon: 30.802498 },
  { name: 'El Salvador', cca2: 'SV', cca3: 'SLV', lat: 13.794185, lon: -88.89653 },
  { name: 'Equatorial Guinea', cca2: 'GQ', cca3: 'GNQ', lat: 1.650801, lon: 10.267895 },
  { name: 'Eritrea', cca2: 'ER', cca3: 'ERI', lat: 15.179384, lon: 39.782334 },
  { name: 'Estonia', cca2: 'EE', cca3: 'EST', lat: 58.595272, lon: 25.013607 },
  { name: 'Eswatini', cca2: 'SZ', cca3: 'SWZ', lat: -26.522503, lon: 31.465866 },
  { name: 'Ethiopia', cca2: 'ET', cca3: 'ETH', lat: 9.145, lon: 40.489673 },
  { name: 'Fiji', cca2: 'FJ', cca3: 'FJI', lat: -17.713371, lon: 178.065032 },
  { name: 'Finland', cca2: 'FI', cca3: 'FIN', lat: 61.92411, lon: 25.748151 },
  { name: 'France', cca2: 'FR', cca3: 'FRA', lat: 46.227638, lon: 2.213749 },
  { name: 'Gabon', cca2: 'GA', cca3: 'GAB', lat: -0.803689, lon: 11.609444 },
  { name: 'Gambia', cca2: 'GM', cca3: 'GMB', lat: 13.443182, lon: -15.310139 },
  { name: 'Georgia', cca2: 'GE', cca3: 'GEO', lat: 42.315407, lon: 43.356892 },
  { name: 'Germany', cca2: 'DE', cca3: 'DEU', lat: 51.165691, lon: 10.451526 },
  { name: 'Ghana', cca2: 'GH', cca3: 'GHA', lat: 7.946527, lon: -1.023194 },
  { name: 'Greece', cca2: 'GR', cca3: 'GRC', lat: 39.074208, lon: 21.824312 },
  { name: 'Grenada', cca2: 'GD', cca3: 'GRD', lat: 12.262776, lon: -61.604171 },
  { name: 'Guatemala', cca2: 'GT', cca3: 'GTM', lat: 15.783471, lon: -90.230759 },
  { name: 'Guinea', cca2: 'GN', cca3: 'GIN', lat: 9.945587, lon: -9.696645 },
  { name: 'Guinea-Bissau', cca2: 'GW', cca3: 'GNB', lat: 11.803749, lon: -15.180413 },
  { name: 'Guyana', cca2: 'GY', cca3: 'GUY', lat: 4.860416, lon: -58.93018 },
  { name: 'Haiti', cca2: 'HT', cca3: 'HTI', lat: 18.971187, lon: -72.285215 },
  { name: 'Honduras', cca2: 'HN', cca3: 'HND', lat: 15.199999, lon: -86.241905 },
  { name: 'Hong Kong', cca2: 'HK', cca3: 'HKG', lat: 22.396428, lon: 114.109497 },
  { name: 'Hungary', cca2: 'HU', cca3: 'HUN', lat: 47.162494, lon: 19.503304 },
  { name: 'Iceland', cca2: 'IS', cca3: 'ISL', lat: 64.963051, lon: -19.020835 },
  { name: 'India', cca2: 'IN', cca3: 'IND', lat: 20.593684, lon: 78.96288 },
  { name: 'Indonesia', cca2: 'ID', cca3: 'IDN', lat: -0.789275, lon: 113.921327 },
  { name: 'Iran', cca2: 'IR', cca3: 'IRN', lat: 32.427908, lon: 53.688046 },
  { name: 'Iraq', cca2: 'IQ', cca3: 'IRQ', lat: 33.223191, lon: 43.679291 },
  { name: 'Ireland', cca2: 'IE', cca3: 'IRL', lat: 53.41291, lon: -8.24389 },
  { name: 'Israel', cca2: 'IL', cca3: 'ISR', lat: 31.046051, lon: 34.851612 },
  { name: 'Italy', cca2: 'IT', cca3: 'ITA', lat: 41.87194, lon: 12.56738 },
  { name: 'Jamaica', cca2: 'JM', cca3: 'JAM', lat: 18.109581, lon: -77.297508 },
  { name: 'Japan', cca2: 'JP', cca3: 'JPN', lat: 36.204824, lon: 138.252924 },
  { name: 'Jordan', cca2: 'JO', cca3: 'JOR', lat: 30.585164, lon: 36.238414 },
  { name: 'Kazakhstan', cca2: 'KZ', cca3: 'KAZ', lat: 48.019573, lon: 66.923684 },
  { name: 'Kenya', cca2: 'KE', cca3: 'KEN', lat: -0.023559, lon: 37.906193 },
  { name: 'Kiribati', cca2: 'KI', cca3: 'KIR', lat: -3.370417, lon: -168.734039 },
  { name: 'Kuwait', cca2: 'KW', cca3: 'KWT', lat: 29.31166, lon: 47.481766 },
  { name: 'Kyrgyzstan', cca2: 'KG', cca3: 'KGZ', lat: 41.20438, lon: 74.766098 },
  { name: 'Laos', cca2: 'LA', cca3: 'LAO', lat: 19.85627, lon: 102.495496 },
  { name: 'Latvia', cca2: 'LV', cca3: 'LVA', lat: 56.879635, lon: 24.603189 },
  { name: 'Lebanon', cca2: 'LB', cca3: 'LBN', lat: 33.854721, lon: 35.862285 },
  { name: 'Lesotho', cca2: 'LS', cca3: 'LSO', lat: -29.609988, lon: 28.233608 },
  { name: 'Liberia', cca2: 'LR', cca3: 'LBR', lat: 6.428055, lon: -9.429499 },
  { name: 'Libya', cca2: 'LY', cca3: 'LBY', lat: 26.3351, lon: 17.228331 },
  { name: 'Liechtenstein', cca2: 'LI', cca3: 'LIE', lat: 47.166, lon: 9.555373 },
  { name: 'Lithuania', cca2: 'LT', cca3: 'LTU', lat: 55.169438, lon: 23.881275 },
  { name: 'Luxembourg', cca2: 'LU', cca3: 'LUX', lat: 49.815273, lon: 6.129583 },
  { name: 'Macao', cca2: 'MO', cca3: 'MAC', lat: 22.198745, lon: 113.543873 },
  { name: 'Madagascar', cca2: 'MG', cca3: 'MDG', lat: -18.766947, lon: 46.869107 },
  { name: 'Malawi', cca2: 'MW', cca3: 'MWI', lat: -13.254308, lon: 34.301525 },
  { name: 'Malaysia', cca2: 'MY', cca3: 'MYS', lat: 4.210484, lon: 101.975766 },
  { name: 'Maldives', cca2: 'MV', cca3: 'MDV', lat: 3.202778, lon: 73.22068 },
  { name: 'Mali', cca2: 'ML', cca3: 'MLI', lat: 17.570692, lon: -3.996166 },
  { name: 'Malta', cca2: 'MT', cca3: 'MLT', lat: 35.937496, lon: 14.375416 },
  { name: 'Marshall Islands', cca2: 'MH', cca3: 'MHL', lat: 7.131474, lon: 171.184478 },
  { name: 'Mauritania', cca2: 'MR', cca3: 'MRT', lat: 21.00789, lon: -10.940835 },
  { name: 'Mauritius', cca2: 'MU', cca3: 'MUS', lat: -20.348404, lon: 57.552152 },
  { name: 'Mexico', cca2: 'MX', cca3: 'MEX', lat: 23.634501, lon: -102.552784 },
  { name: 'Micronesia', cca2: 'FM', cca3: 'FSM', lat: 7.425554, lon: 150.550812 },
  { name: 'Moldova', cca2: 'MD', cca3: 'MDA', lat: 47.411631, lon: 28.369885 },
  { name: 'Monaco', cca2: 'MC', cca3: 'MCO', lat: 43.750298, lon: 7.412841 },
  { name: 'Mongolia', cca2: 'MN', cca3: 'MNG', lat: 46.862496, lon: 103.846656 },
  { name: 'Montenegro', cca2: 'ME', cca3: 'MNE', lat: 42.708678, lon: 19.37439 },
  { name: 'Morocco', cca2: 'MA', cca3: 'MAR', lat: 31.791702, lon: -7.09262 },
  { name: 'Mozambique', cca2: 'MZ', cca3: 'MOZ', lat: -18.665695, lon: 35.529562 },
  { name: 'Myanmar', cca2: 'MM', cca3: 'MMR', lat: 21.913965, lon: 95.956223 },
  { name: 'Namibia', cca2: 'NA', cca3: 'NAM', lat: -22.95764, lon: 18.49041 },
  { name: 'Nauru', cca2: 'NR', cca3: 'NRU', lat: -0.522778, lon: 166.931503 },
  { name: 'Nepal', cca2: 'NP', cca3: 'NPL', lat: 28.394857, lon: 84.124008 },
  { name: 'Netherlands', cca2: 'NL', cca3: 'NLD', lat: 52.132633, lon: 5.291266 },
  { name: 'New Zealand', cca2: 'NZ', cca3: 'NZL', lat: -40.900557, lon: 174.885971 },
  { name: 'Nicaragua', cca2: 'NI', cca3: 'NIC', lat: 12.865416, lon: -85.207229 },
  { name: 'Niger', cca2: 'NE', cca3: 'NER', lat: 17.607789, lon: 8.081666 },
  { name: 'Nigeria', cca2: 'NG', cca3: 'NGA', lat: 9.081999, lon: 8.675277 },
  { name: 'North Korea', cca2: 'KP', cca3: 'PRK', lat: 40.339852, lon: 127.510093 },
  { name: 'North Macedonia', cca2: 'MK', cca3: 'MKD', lat: 41.608635, lon: 21.745275 },
  { name: 'Norway', cca2: 'NO', cca3: 'NOR', lat: 60.472024, lon: 8.468946 },
  { name: 'Oman', cca2: 'OM', cca3: 'OMN', lat: 21.512583, lon: 55.923255 },
  { name: 'Pakistan', cca2: 'PK', cca3: 'PAK', lat: 30.375321, lon: 69.345116 },
  { name: 'Palau', cca2: 'PW', cca3: 'PLW', lat: 7.51498, lon: 134.58252 },
  { name: 'Palestine', cca2: 'PS', cca3: 'PSE', lat: 31.952162, lon: 35.233154 },
  { name: 'Panama', cca2: 'PA', cca3: 'PAN', lat: 8.537981, lon: -80.782127 },
  { name: 'Papua New Guinea', cca2: 'PG', cca3: 'PNG', lat: -6.314993, lon: 143.95555 },
  { name: 'Paraguay', cca2: 'PY', cca3: 'PRY', lat: -23.442503, lon: -58.443832 },
  { name: 'Peru', cca2: 'PE', cca3: 'PER', lat: -9.189967, lon: -75.015152 },
  { name: 'Philippines', cca2: 'PH', cca3: 'PHL', lat: 12.879721, lon: 121.774017 },
  { name: 'Poland', cca2: 'PL', cca3: 'POL', lat: 51.919438, lon: 19.145136 },
  { name: 'Portugal', cca2: 'PT', cca3: 'PRT', lat: 39.399872, lon: -8.224454 },
  { name: 'Qatar', cca2: 'QA', cca3: 'QAT', lat: 25.354826, lon: 51.183884 },
  { name: 'Romania', cca2: 'RO', cca3: 'ROU', lat: 45.943161, lon: 24.96676 },
  { name: 'Russia', cca2: 'RU', cca3: 'RUS', lat: 61.52401, lon: 105.318756 },
  { name: 'Rwanda', cca2: 'RW', cca3: 'RWA', lat: -1.940278, lon: 29.873888 },
  { name: 'Saint Kitts and Nevis', cca2: 'KN', cca3: 'KNA', lat: 17.357822, lon: -62.782998 },
  { name: 'Saint Lucia', cca2: 'LC', cca3: 'LCA', lat: 13.909444, lon: -60.978893 },
  { name: 'Saint Vincent and the Grenadines', cca2: 'VC', cca3: 'VCT', lat: 12.984305, lon: -61.287228 },
  { name: 'Samoa', cca2: 'WS', cca3: 'WSM', lat: -13.759029, lon: -172.104629 },
  { name: 'San Marino', cca2: 'SM', cca3: 'SMR', lat: 43.94236, lon: 12.457777 },
  { name: 'Sao Tome and Principe', cca2: 'ST', cca3: 'STP', lat: 0.18636, lon: 6.613081 },
  { name: 'Saudi Arabia', cca2: 'SA', cca3: 'SAU', lat: 23.885942, lon: 45.079162 },
  { name: 'Senegal', cca2: 'SN', cca3: 'SEN', lat: 14.497401, lon: -14.452362 },
  { name: 'Serbia', cca2: 'RS', cca3: 'SRB', lat: 44.016521, lon: 21.005859 },
  { name: 'Seychelles', cca2: 'SC', cca3: 'SYC', lat: -4.679574, lon: 55.491977 },
  { name: 'Sierra Leone', cca2: 'SL', cca3: 'SLE', lat: 8.460555, lon: -11.779889 },
  { name: 'Singapore', cca2: 'SG', cca3: 'SGP', lat: 1.352083, lon: 103.819836 },
  { name: 'Slovakia', cca2: 'SK', cca3: 'SVK', lat: 48.669026, lon: 19.699024 },
  { name: 'Slovenia', cca2: 'SI', cca3: 'SVN', lat: 46.151241, lon: 14.995463 },
  { name: 'Solomon Islands', cca2: 'SB', cca3: 'SLB', lat: -9.64571, lon: 160.156194 },
  { name: 'Somalia', cca2: 'SO', cca3: 'SOM', lat: 5.152149, lon: 46.199616 },
  { name: 'South Africa', cca2: 'ZA', cca3: 'ZAF', lat: -30.559482, lon: 22.937506 },
  { name: 'South Korea', cca2: 'KR', cca3: 'KOR', lat: 35.907757, lon: 127.766922 },
  { name: 'South Sudan', cca2: 'SS', cca3: 'SSD', lat: 6.876992, lon: 31.306979 },
  { name: 'Spain', cca2: 'ES', cca3: 'ESP', lat: 40.463667, lon: -3.74922 },
  { name: 'Sri Lanka', cca2: 'LK', cca3: 'LKA', lat: 7.873054, lon: 80.771797 },
  { name: 'Sudan', cca2: 'SD', cca3: 'SDN', lat: 12.862807, lon: 30.217636 },
  { name: 'Suriname', cca2: 'SR', cca3: 'SUR', lat: 3.919305, lon: -56.027783 },
  { name: 'Sweden', cca2: 'SE', cca3: 'SWE', lat: 60.128161, lon: 18.643501 },
  { name: 'Switzerland', cca2: 'CH', cca3: 'CHE', lat: 46.818188, lon: 8.227512 },
  { name: 'Syria', cca2: 'SY', cca3: 'SYR', lat: 34.802075, lon: 38.996815 },
  { name: 'Taiwan', cca2: 'TW', cca3: 'TWN', lat: 23.69781, lon: 120.960515 },
  { name: 'Tajikistan', cca2: 'TJ', cca3: 'TJK', lat: 38.861034, lon: 71.276093 },
  { name: 'Tanzania', cca2: 'TZ', cca3: 'TZA', lat: -6.369028, lon: 34.888822 },
  { name: 'Thailand', cca2: 'TH', cca3: 'THA', lat: 15.870032, lon: 100.992541 },
  { name: 'Timor-Leste', cca2: 'TL', cca3: 'TLS', lat: -8.874217, lon: 125.727539 },
  { name: 'Togo', cca2: 'TG', cca3: 'TGO', lat: 8.619543, lon: 0.824782 },
  { name: 'Tonga', cca2: 'TO', cca3: 'TON', lat: -21.178986, lon: -175.198242 },
  { name: 'Trinidad and Tobago', cca2: 'TT', cca3: 'TTO', lat: 10.691803, lon: -61.222503 },
  { name: 'Tunisia', cca2: 'TN', cca3: 'TUN', lat: 33.886917, lon: 9.537499 },
  { name: 'Turkey', cca2: 'TR', cca3: 'TUR', lat: 38.963745, lon: 35.243322 },
  { name: 'Turkmenistan', cca2: 'TM', cca3: 'TKM', lat: 38.969719, lon: 59.556278 },
  { name: 'Tuvalu', cca2: 'TV', cca3: 'TUV', lat: -7.109535, lon: 177.64933 },
  { name: 'Uganda', cca2: 'UG', cca3: 'UGA', lat: 1.373333, lon: 32.290275 },
  { name: 'Ukraine', cca2: 'UA', cca3: 'UKR', lat: 48.379433, lon: 31.16558 },
  { name: 'United Arab Emirates', cca2: 'AE', cca3: 'ARE', lat: 23.424076, lon: 53.847818 },
  { name: 'United Kingdom', cca2: 'GB', cca3: 'GBR', lat: 55.378051, lon: -3.435973 },
  { name: 'United States', cca2: 'US', cca3: 'USA', lat: 37.09024, lon: -95.712891 },
  { name: 'Uruguay', cca2: 'UY', cca3: 'URY', lat: -32.522779, lon: -55.765835 },
  { name: 'Uzbekistan', cca2: 'UZ', cca3: 'UZB', lat: 41.377491, lon: 64.585262 },
  { name: 'Vanuatu', cca2: 'VU', cca3: 'VUT', lat: -15.376706, lon: 166.959158 },
  { name: 'Vatican City', cca2: 'VA', cca3: 'VAT', lat: 41.902916, lon: 12.453389 },
  { name: 'Venezuela', cca2: 'VE', cca3: 'VEN', lat: 6.42375, lon: -66.58973 },
  { name: 'Vietnam', cca2: 'VN', cca3: 'VNM', lat: 14.058324, lon: 108.277199 },
  { name: 'Yemen', cca2: 'YE', cca3: 'YEM', lat: 15.552727, lon: 48.516388 },
  { name: 'Zambia', cca2: 'ZM', cca3: 'ZMB', lat: -13.133897, lon: 27.849332 },
  { name: 'Zimbabwe', cca2: 'ZW', cca3: 'ZWE', lat: -19.015438, lon: 29.154857 },
]

// Aliases the backend may emit: nicknames, prior names, Indonesian translations
// (TARGET_LANGUAGE=id in compose), and a couple of frequently-scraped variants.
// Keys must already be lowercased + collapsed via the same normalize() below.
const ALIASES: Readonly<Record<string, string>> = {
  usa: 'US',
  'u.s.': 'US',
  'u.s.a.': 'US',
  america: 'US',
  'united states of america': 'US',
  'amerika serikat': 'US',
  uk: 'GB',
  'u.k.': 'GB',
  britain: 'GB',
  'great britain': 'GB',
  england: 'GB',
  inggris: 'GB',
  'kerajaan bersatu': 'GB',
  uae: 'AE',
  emirates: 'AE',
  'uni emirat arab': 'AE',
  'saudi arabia': 'SA',
  'arab saudi': 'SA',
  'south korea': 'KR',
  'korea selatan': 'KR',
  'republic of korea': 'KR',
  'korea, republic of': 'KR',
  'north korea': 'KP',
  'korea utara': 'KP',
  "democratic people's republic of korea": 'KP',
  'czech republic': 'CZ',
  ceko: 'CZ',
  'republik ceko': 'CZ',
  'ivory coast': 'CI',
  'pantai gading': 'CI',
  'cape verde': 'CV',
  swaziland: 'SZ',
  burma: 'MM',
  'east timor': 'TL',
  'timor leste': 'TL',
  'timor lorosae': 'TL',
  russia: 'RU',
  'russian federation': 'RU',
  rusia: 'RU',
  iran: 'IR',
  'islamic republic of iran': 'IR',
  syria: 'SY',
  'syrian arab republic': 'SY',
  'viet nam': 'VN',
  'lao people’s democratic republic': 'LA',
  macedonia: 'MK',
  'republic of macedonia': 'MK',
  fyrom: 'MK',
  'republic of china': 'TW',
  'chinese taipei': 'TW',
  hongkong: 'HK',
  'hong kong sar': 'HK',
  macau: 'MO',
  'macao sar': 'MO',
  vatikan: 'VA',
  'holy see': 'VA',
  jepang: 'JP',
  jerman: 'DE',
  prancis: 'FR',
  perancis: 'FR',
  spanyol: 'ES',
  italia: 'IT',
  yunani: 'GR',
  belanda: 'NL',
  belgia: 'BE',
  swiss: 'CH',
  swedia: 'SE',
  norwegia: 'NO',
  denmark: 'DK',
  finlandia: 'FI',
  polandia: 'PL',
  austria: 'AT',
  hungaria: 'HU',
  turki: 'TR',
  filipina: 'PH',
  singapura: 'SG',
  kamboja: 'KH',
  brasil: 'BR',
  meksiko: 'MX',
  kanada: 'CA',
  'selandia baru': 'NZ',
  mesir: 'EG',
  'afrika selatan': 'ZA',
  maroko: 'MA',
  cina: 'CN',
  tiongkok: 'CN',
  prc: 'CN',
  "people's republic of china": 'CN',
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics post-NFD
    .replace(/\s+/g, ' ')
}

const BY_CCA2 = new Map<string, CountryRecord>()
const BY_CCA3 = new Map<string, CountryRecord>()
const BY_NAME = new Map<string, CountryRecord>()
for (const c of COUNTRIES) {
  BY_CCA2.set(c.cca2, c)
  BY_CCA3.set(c.cca3, c)
  BY_NAME.set(normalize(c.name), c)
}

export function resolveCountry(input: string | null | undefined): CountryRecord | null {
  if (!input) return null
  const raw = input.trim()
  if (!raw) return null

  // Direct ISO codes (case-insensitive)
  const upper = raw.toUpperCase()
  if (upper.length === 2 && BY_CCA2.has(upper)) return BY_CCA2.get(upper)!
  if (upper.length === 3 && BY_CCA3.has(upper)) return BY_CCA3.get(upper)!

  const norm = normalize(raw)
  const direct = BY_NAME.get(norm)
  if (direct) return direct

  const aliasCode = ALIASES[norm]
  if (aliasCode && BY_CCA2.has(aliasCode)) return BY_CCA2.get(aliasCode)!

  return null
}

export function flagEmoji(cca2: string | null | undefined): string {
  if (!cca2) return ''
  const code = cca2.trim().toUpperCase()
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) return ''
  // Regional indicator symbols: A=0x1F1E6, so 'A' + 0x1F1E6 - 'A'.charCodeAt(0).
  const A = 0x1f1e6
  const base = 'A'.charCodeAt(0)
  return String.fromCodePoint(A + (code.charCodeAt(0) - base), A + (code.charCodeAt(1) - base))
}
