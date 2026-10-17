const mapWidth = 960
const mapHeight = 600

// PR/VI inset box (bottom right of the map)
const inset = { x: 760, y: 482, width: 190, height: 108 }

const dotRadius = 3.5

const parseDate = d3.timeParse('%Y%m%d')
const formatDate = d3.timeFormat('%B %-d, %Y')

const firstDate = parseDate('20170101')
const lastDate = parseDate('20170921')

const allDates = d3.timeDay.range(firstDate, d3.timeDay.offset(lastDate, 1))

// ---------- Colors ----------
const zeroColor = '#3e444d'

const rainBreaks = [0.01, 0.1, 0.25, 0.5, 1, 2, 3, 5, 8, 12, 20, 30, 45, 60]
const rainColors = [
    zeroColor,
    '#2e7d4f', '#43a85f',
    '#3fbfa0', '#4fc3f7', '#2f80ed',
    '#4b55d8', '#7b4fd6', '#ad4fd6',
    '#e0409a', '#f0443a', '#d42020',
    '#a51212', '#7e0a0a', '#5e0000'
]
const rainScale = d3.scaleThreshold().domain(rainBreaks).range(rainColors)
const rainRingAt = 20    // dark reds get a light ring so they show beeter on the dark map

const snowBreaks = [0.1, 0.5, 1, 2, 4, 8, 12, 18, 24, 36, 60, 100]
// piecewise blends the 4 colors, quantize picks one evenly spaced color per bin
const snowRamp = d3.piecewise(d3.interpolateRgb, ['#4a6fa5', '#7fb3e0', '#c6e2f7', '#ffffff'])
const snowColors = [zeroColor].concat(d3.quantize(snowRamp, snowBreaks.length))
const snowScale = d3.scaleThreshold().domain(snowBreaks).range(snowColors)
const snowGlowAt = 18

// ---------- Storms ----------
// Help from generative AI (Claude): storm list, dates, descriptions, and zoom boxes.
// zoomBox is [[west lon, south lat], [east lon, north lat]]
const storms = [
    {
        id: 'stella', name: 'Winter Storm Stella', measure: 'snow',
        start: '20170313', end: '20170315', peakDay: '20170314',
        zoomBox: [[-81, 38.5], [-67, 47.5]],
        where: 'A late-season blizzard across Pennsylvania, New York and New England.',
        peak: 'Binghamton, NY got 31.2 in of snow on Mar 14 and 35.3 in over the storm.'
    },
    {
        id: 'cindy', name: 'Tropical Storm Cindy', measure: 'rain',
        start: '20170620', end: '20170623', peakDay: '20170621',
        zoomBox: [[-97, 27], [-81, 35]],
        where: 'Came ashore on the Texas and Louisiana border, then soaked the Gulf Coast to the Florida Panhandle.',
        peak: 'Gulfport-Biloxi, MS got 9.3 in from Jun 20 to 23. Pensacola, FL got 4.9 in on Jun 21 alone.'
    },
    {
        id: 'emily', name: 'Tropical Storm Emily', measure: 'rain',
        start: '20170731', end: '20170801', peakDay: '20170731',
        zoomBox: [[-88, 24.5], [-79, 31.5]],
        where: 'Formed in the Gulf and made landfall near Bradenton, FL, then crossed central Florida.',
        peak: 'Sarasota-Bradenton got 3.9 in on Jul 31, with gusts to 50 mph.'
    },
    {
        id: 'harvey', name: 'Hurricane Harvey', measure: 'rain',
        start: '20170825', end: '20170831', peakDay: '20170829',
        zoomBox: [[-100, 26], [-89, 33]],
        where: 'Landfall near Rockport, TX on Aug 25. It stalled over Houston for days, then moved into Louisiana.',
        peak: 'Port Arthur, TX got 47.5 in from Aug 25 to 31, including 26.0 in on Aug 29. That is the wettest day in the whole dataset.'
    },
    {
        id: 'irma', name: 'Hurricane Irma', measure: 'rain', usesInset: true,
        start: '20170906', end: '20170911', peakDay: '20170910',
        zoomBox: [[-88, 24.5], [-78, 35.5]],
        where: 'Passed just north of Puerto Rico and the Virgin Islands on Sep 6, then hit Florida on Sep 10 and 11 and moved into Georgia and South Carolina.',
        peak: 'Fort Pierce, FL got 16.1 in from Sep 6 to 11, including 13.1 in on Sep 10. Gusts reached 91 mph at West Palm Beach.'
    },
    {
        id: 'maria', name: 'Hurricane Maria', measure: 'rain', usesInset: true,
        start: '20170918', end: '20170921', peakDay: '20170919',
        zoomBox: null,
        where: 'Hit St. Croix (US Virgin Islands) on Sep 19 and Puerto Rico on Sep 20 as a major hurricane.',
        // double quotes because of the apostrophe in "storm's"
        peak: "This data has no rain totals for Maria. All four PR and VI stations stop reporting on Sep 19, the day the storm arrived. That might not be the storm's fault, though. Starting Sep 18, more than half of the stations across the US stop reporting too, since the dataset is winding down."
    }
]

// ---------- Current state ----------
let measure = 'rain'     // 'rain' or 'snow'
let mode = 'daily'       // 'daily' or 'total'
let rangeStart = 0
let rangeEnd = allDates.length - 1
let currentDay = dayOf('20170829')

let slider
let zoomScale = 1
let hoveredStation = null

let allStations = []
let mapStations = []
let insetStations = []

// ---------- Projections ----------
// Help from generative AI (Claude): US map setup.
// A projection turns [longitude, latitude] into [x, y]. geoAlbersUsa covers the
// 50 states, so PR and VI get their own geoMercator projection in the inset.
const projection = d3.geoAlbersUsa()
const path = d3.geoPath(projection)
const insetProjection = d3.geoMercator()
const insetPath = d3.geoPath(insetProjection)

// FIPS ids: PR (72) and VI (78) go in the inset
const insetIds = ['72', '78']
const skipIds = ['60', '66', '69']

// ---------- Create SVG ----------
const mapSvg = d3.select('#map')
    .append('svg')
    .attr('viewBox', `0 0 ${mapWidth} ${mapHeight}`)   // viewBox lets the map shrink on small screens

const mapLayer = mapSvg.append('g')          // zooms and pans
const statesLayer = mapLayer.append('g')
const stationLayer = mapLayer.append('g')
const insetLayer = mapSvg.append('g')
    .attr('transform', `translate(${inset.x},${inset.y})`)

// Glow for deep snow
const glow = mapSvg.append('defs')
    .append('filter')
    .attr('id', 'glow')
    .attr('x', '-100%').attr('y', '-100%')
    .attr('width', '300%').attr('height', '300%')
glow.append('feGaussianBlur')
    .attr('stdDeviation', 2.5)
    .attr('result', 'blur')
const glowMerge = glow.append('feMerge')
glowMerge.append('feMergeNode').attr('in', 'blur')
glowMerge.append('feMergeNode').attr('in', 'SourceGraphic')

// ---------- Bar chart ----------
const barMargin = { top: 20, right: 20, bottom: 30, left: 55 }
const barWidth = mapWidth - barMargin.left - barMargin.right
const barHeight = 190 - barMargin.top - barMargin.bottom

const barSvg = d3.select('#barChart')
    .append('svg')
    .attr('viewBox', `0 0 ${barWidth + barMargin.left + barMargin.right} ${barHeight + barMargin.top + barMargin.bottom}`)
    .append('g')
    .attr('transform', `translate(${barMargin.left},${barMargin.top})`)

const barX = d3.scaleBand()
    .domain(d3.range(allDates.length))
    .range([0, barWidth])
    .padding(0.15)
let barY
let dailyStats = {}

// brushX: drag a box across the bar chart to pick a date range
const brush = d3.brushX()
    .extent([[0, 0], [barWidth, barHeight]])
    .on('end', brushed)

// ---------- Zoom ----------
const zoom = d3.zoom()
    .scaleExtent([1, 12])
    .translateExtent([[0, 0], [mapWidth, mapHeight]])
    .on('zoom', zoomed)

mapSvg.call(zoom)

const legendSvg = d3.select('#legend')
    .append('svg')
    .attr('viewBox', `0 0 ${mapWidth} 56`)

function init() {
    // Promise.all waits for all three files
    Promise.all([
        d3.json('data/states-10m.json'),
        d3.csv('data/stations.csv', d => ({
            id: +d.id,
            name: d.name,
            state: d.state,
            lat: +d.lat,
            lon: +d.lon,
            elevation: +d.elevation
        })),
        d3.csv('data/readings.csv', d => ({
            id: +d.id,
            date: d.date,
            prcp: toNumber(d.PRCP),
            snow: toNumber(d.SNOW),
            snwd: toNumber(d.SNWD),
            gust: toNumber(d.WSF5)
        }))
    ])
    .then(([us, stations, readings]) => {
        allStations = buildStations(stations, readings)
        console.log('stations:', allStations.length, 'days:', allDates.length)

        drawMap(us)
        placeStations()
        computeDailyStats()
        setupSelector()
        setupBarChart()

        buildSlider()
        updateVis()
        updateLegend()
        updateLabels()
        updateBars()
        d3.select('#loading').style('display', 'none')
    })
    .catch(error => console.error('Error loading data:', error))
}

function toNumber(value) {
    return value === '' ? null : +value
}

// "20170829" -> 240 (days after Jan 1)
function dayOf(dateText) {
    return d3.timeDay.count(firstDate, parseDate(dateText))
}

// Give each station one array per variable with a slot per day
function buildStations(stations, readings) {
    const dateIndex = new Map()
    allDates.forEach((date, i) => dateIndex.set(d3.timeFormat('%Y%m%d')(date), i))

    stations.forEach(s => {
        s.prcp = new Array(allDates.length).fill(null)
        s.snow = new Array(allDates.length).fill(null)
        s.snwd = new Array(allDates.length).fill(null)
        s.gust = new Array(allDates.length).fill(null)
    })

    readings.forEach(r => {
        const s = stations[r.id]
        const day = dateIndex.get(r.date)
        s.prcp[day] = r.prcp
        s.snow[day] = r.snow
        s.snwd[day] = r.snwd
        s.gust[day] = r.gust
    })

    return stations
}

// help from generation with AI (Claude): US map and PR/VI inset.
function drawMap(us) {
    // topojson.feature turns the TopoJSON file into GeoJSON shapes D3 can draw
    const states = topojson.feature(us, us.objects.states).features

    const mainStates = states.filter(d => !insetIds.includes(d.id) && !skipIds.includes(d.id))
    const insetStates = states.filter(d => insetIds.includes(d.id))

    // fitExtent scales the projection so the states fill the SVG
    projection.fitExtent([[10, 10], [mapWidth - 10, mapHeight - 10]],
        { type: 'FeatureCollection', features: mainStates })

    statesLayer.selectAll('.state')
        .data(mainStates)
        .join('path')
        .attr('class', 'state')
        .attr('d', path)

    // PR / VI inset
    insetLayer.append('rect')
        .attr('class', 'inset-box')
        .attr('width', inset.width)
        .attr('height', inset.height)
        .attr('rx', 4)

    insetLayer.append('text')
        .attr('class', 'inset-title')
        .attr('x', 8)
        .attr('y', 15)
        .text('Puerto Rico & US Virgin Islands')

    insetProjection.fitExtent([[10, 24], [inset.width - 10, inset.height - 8]],
        { type: 'FeatureCollection', features: insetStates })

    insetLayer.selectAll('.state')
        .data(insetStates)
        .join('path')
        .attr('class', 'state')
        .attr('d', insetPath)

    insetLayer.append('g').attr('class', 'inset-stations')
}

// Help enerated with AI (Claude): plotting stations with the projections.
// Works out each station's x/y once. PR and VI use the inset projection.
function placeStations() {
    allStations.forEach(s => {
        const isIsland = s.state === 'PR' || s.state === 'VI'
        const point = isIsland ? insetProjection([s.lon, s.lat]) : projection([s.lon, s.lat])
        // geoAlbersUsa returns null for points it can't place
        if (point) {
            s.x = point[0]
            s.y = point[1]
        }
        s.isIsland = isIsland
    })
    mapStations = allStations.filter(s => !s.isIsland && s.x !== undefined)
    insetStations = allStations.filter(s => s.isIsland)
}

// ---------- Values and colors ----------

function getValue(s) {
    const values = measure === 'rain' ? s.prcp : s.snow

    if (mode === 'daily') {
        return values[currentDay]
    }

    let total = null
    for (let i = rangeStart; i <= currentDay; i++) {
        if (values[i] !== null) {
            total = total + values[i]    // null + number = number
        }
    }
    return total
}

function colorFor(value) {
    return measure === 'rain' ? rainScale(value) : snowScale(value)
}

function hasGlow(value) {
    return measure === 'snow' && value !== null && value >= snowGlowAt
}

// ---------- Station dots ----------

function updateVis() {
    drawStations(stationLayer, mapStations)
    drawStations(insetLayer.select('.inset-stations'), insetStations)
}

// Divide by the zoom scale so dots stay the same size on screen 
function dotSize(d) {
    let r = hasGlow(d.value) ? dotRadius + 1.5 : dotRadius
    if (d === hoveredStation) r = r * 1.8
    return d.isIsland ? r : r / zoomScale
}

function drawStations(layer, stations) {
    stations.forEach(s => s.value = getValue(s))

    // biggest values drawn last so they sit on top
    const sorted = stations.slice().sort((a, b) =>
        (a.value === null ? -1 : a.value) - (b.value === null ? -1 : b.value))

    layer.selectAll('.station')
        .data(sorted, d => d.id)
        .join(
            function(enter) {
                return enter
                    .append('circle')
                    .attr('class', 'station')
                    .attr('cx', d => d.x)
                    .attr('cy', d => d.y)
                    .on('mouseover', function(event, d) {
                        hoveredStation = d
                        d3.select(this)
                            .classed('hovered', true)
                            .attr('r', dotSize(d))
                            .raise()
                        d3.select('#tooltip')
                            .style('display', 'block')
                            .html(stationTooltipHtml(d))
                        moveTooltip(event)
                    })
                    .on('mousemove', function(event) {
                        moveTooltip(event)
                    })
                    .on('mouseout', function(event, d) {
                        hoveredStation = null
                        d3.select(this)
                            .classed('hovered', false)
                            .attr('r', dotSize(d))
                        d3.select('#tooltip').style('display', 'none')
                    })
            },
            function(update) {
                return update
            },
            function(exit) {
                return exit.remove()
            }
        )
        .attr('r', d => dotSize(d))
        .attr('filter', d => hasGlow(d.value) ? 'url(#glow)' : null)
        .classed('no-reading', d => d.value === null)
        .classed('extreme', d => measure === 'rain' && d.value >= rainRingAt)
        .style('fill', d => d.value === null ? 'none' : colorFor(d.value))
        .order()    // match the SVG order to the sorted data
}

// ---------- Controls ----------

function setupSelector() {
    // Storm dropdown
    const stormOptions = [{ id: 'none', name: 'Pick a storm...' }].concat(storms)

    d3.select('#stormSelect')
        .selectAll('option')
        .data(stormOptions)
        .enter()
        .append('option')
        .text(d => d.name)
        .attr('value', d => d.id)

    d3.select('#stormSelect').on('change', function() {
        const id = d3.select(this).property('value')

        if (id === 'none') {
            showStormCard(null)
            setRange(0, allDates.length - 1)
            resetZoom()
            return
        }
        selectStorm(storms.find(s => s.id === id))
    })

    // Toggles
    d3.selectAll('#measureToggle button').on('click', function() {
        setMeasure(d3.select(this).attr('data-value'))
    })

    d3.selectAll('#modeToggle button').on('click', function() {
        mode = d3.select(this).attr('data-value')
        d3.selectAll('#modeToggle button').classed('active', false)
        d3.select(this).classed('active', true)
        updateVis()
        updateLegend()
    })

    d3.select('#resetZoom').on('click', () => resetZoom())
}

function selectStorm(storm) {
    const buffer = 3
    const start = Math.max(0, dayOf(storm.start) - buffer)
    const end = Math.min(allDates.length - 1, dayOf(storm.end) + buffer)

    showStormCard(storm)
    setMeasure(storm.measure)
    setRange(start, end, dayOf(storm.peakDay))
    zoomToStorm(storm)
}

// If no day is given keep the current day if it fits otherwise use the start
function setRange(start, end, day) {
    rangeStart = start
    rangeEnd = end

    if (day !== undefined) {
        currentDay = day
    } else if (currentDay < start || currentDay > end) {
        currentDay = start
    }

    buildSlider()
    updateVis()
    updateLegend()
    updateLabels()
    updateBars()
}

function setMeasure(value) {
    measure = value
    d3.selectAll('#measureToggle button')
        .classed('active', function() { return d3.select(this).attr('data-value') === value })
    updateVis()
    updateLegend()
    updateBars()
}

function setDay(day) {
    if (day === currentDay) return
    currentDay = day
    updateVis()
    updateLabels()
    updateDayMarker()
}

// ---------- Slider ----------

// Rebuilt from scratch whenever the range changes
function buildSlider() {
    const sliderWidth = 860
    const length = rangeEnd - rangeStart + 1

    // long ranges: tick on the 1st of each month, short ranges: every 1 or 3 days
    let ticks
    if (length > 60) {
        ticks = d3.range(rangeStart, rangeEnd + 1).filter(i => allDates[i].getDate() === 1)
    } else {
        ticks = d3.range(rangeStart, rangeEnd + 1, length > 16 ? 3 : 1)
    }

    slider = d3.sliderHorizontal()
        .min(rangeStart)
        .max(rangeEnd)
        .step(1)
        .width(sliderWidth)
        .tickValues(ticks)
        .tickFormat(i => d3.timeFormat('%b %-d')(allDates[i]))
        .default(currentDay)
        .displayValue(false)
        .on('onchange', val => setDay(Math.round(val)))

    d3.select('#slider').selectAll('*').remove()

    d3.select('#slider')
        .append('svg')
        .attr('viewBox', `0 0 ${sliderWidth + 60} 60`)
        .append('g')
        .attr('transform', 'translate(30,15)')
        .call(slider)
}

function updateLabels() {
    d3.select('#dateLabel').text(formatDate(allDates[currentDay]))

    const shortDate = d3.timeFormat('%b %-d')
    const dayNumber = currentDay - rangeStart + 1
    const length = rangeEnd - rangeStart + 1
    d3.select('#rangeLabel').text(
        `Range: ${shortDate(allDates[rangeStart])} to ${shortDate(allDates[rangeEnd])} (day ${dayNumber} of ${length})`)

    if (mode === 'total') updateLegend()
}

// ---------- Storm card ----------

function showStormCard(storm) {
    const card = d3.select('#stormCard')

    if (storm === null) {
        card.style('display', 'none')
        insetLayer.select('.inset-box').classed('highlight', false)
        return
    }

    const shortDate = d3.timeFormat('%b %-d')
    card.style('display', 'block')
        .html(`<h3>${storm.name}</h3>
               <p class="storm-dates">${shortDate(parseDate(storm.start))} to ${shortDate(parseDate(storm.end))}, 2017</p>
               <p>${storm.where}</p>
               <p><strong>Peak:</strong> ${storm.peak}</p>`)
}

// ---------- Bar chart and brushing ----------

// Biggest value at any station for every day, worked out once at load
function computeDailyStats() {
    ['rain', 'snow'].forEach(m => {
        const key = m === 'rain' ? 'prcp' : 'snow'
        dailyStats[m] = d3.range(allDates.length).map(day => ({
            day: day,
            max: d3.max(allStations, s => s[key][day]) || 0
        }))
    })
}

function setupBarChart() {
    barSvg.append('g').attr('class', 'bars')

    const monthStarts = d3.range(allDates.length).filter(i => allDates[i].getDate() === 1)
    barSvg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${barHeight})`)
        .call(d3.axisBottom(barX)
            .tickValues(monthStarts)
            .tickFormat(i => d3.timeFormat('%b')(allDates[i])))

    barSvg.append('g').attr('class', 'y-axis')

    barSvg.append('text')
        .attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -barHeight / 2)
        .attr('y', -barMargin.left + 14)
        .style('text-anchor', 'middle')
        .text('Inches')

    barSvg.append('g')
        .attr('class', 'brush')
        .call(brush)

    barSvg.append('line')
        .attr('class', 'day-marker')
        .attr('y1', -6)
        .attr('y2', barHeight)
}

function dayFromX(x) {
    const day = Math.floor(x / barX.step())
    return Math.max(0, Math.min(allDates.length - 1, day))
}

function updateBars() {
    const stats = dailyStats[measure]

    barY = d3.scaleLinear()
        .domain([0, d3.max(stats, d => d.max)])
        .range([barHeight, 0])
        .nice()

    barSvg.select('.y-axis')
        .call(d3.axisLeft(barY).ticks(4).tickSize(-barWidth))
        .call(g => g.selectAll('.tick line').attr('class', 'grid-line'))
        .call(g => g.select('.domain').remove())

    barSvg.select('.bars')
        .selectAll('.bar')
        .data(stats, d => d.day)
        .join(
            function(enter) {
                return enter.append('rect')
                    .attr('class', 'bar')
                    .attr('x', d => barX(d.day))
                    .attr('width', barX.bandwidth())
                    .attr('y', barHeight)
                    .attr('height', 0)
            },
            function(update) {
                return update
            },
            function(exit) {
                return exit.remove()
            }
        )
        .transition()
        .duration(600)
        .attr('y', d => barY(d.max))
        .attr('height', d => barHeight - barY(d.max))
        .style('fill', d => colorFor(d.max))

    updateBarRange()
    updateDayMarker()
}

function updateBarRange() {
    barSvg.selectAll('.bar')
        .classed('outside', d => d.day < rangeStart || d.day > rangeEnd)

    const isWholeYear = rangeStart === 0 && rangeEnd === allDates.length - 1
    barSvg.select('.brush').call(brush.move,
        isWholeYear ? null : [barX(rangeStart), barX(rangeEnd) + barX.bandwidth()])
}

function updateDayMarker() {
    const x = barX(currentDay) + barX.bandwidth() / 2
    barSvg.select('.day-marker')
        .attr('x1', x)
        .attr('x2', x)
}

function brushed(event) {
    // No sourceEvent means brush.move called this from code ignore it (avoids a loop)
    if (!event.sourceEvent) return

    // A click without dragging: jump to the clicked day
    if (!event.selection) {
        const [x] = d3.pointer(event.sourceEvent, barSvg.node())
        const day = dayFromX(x)
        if (day < rangeStart || day > rangeEnd) {
            d3.select('#stormSelect').property('value', 'none')
            showStormCard(null)
            setRange(0, allDates.length - 1, day)
        } else {
            updateBarRange()
            slider.value(day)
        }
        return
    }

    const [x0, x1] = event.selection
    const start = dayFromX(x0)
    const end = Math.max(start, dayFromX(x1 - 1))

    d3.select('#stormSelect').property('value', 'none')
    showStormCard(null)
    setRange(start, end)
}

// ---------- Tooltips ----------

// Flip to the left of the mouse near the right edge of the window
function moveTooltip(event) {
    const tooltip = d3.select('#tooltip')
    const tipWidth = tooltip.node().offsetWidth
    const nearRightEdge = event.clientX + tipWidth + 30 > window.innerWidth
    tooltip
        .style('left', (nearRightEdge ? event.pageX - tipWidth - 15 : event.pageX + 15) + 'px')
        .style('top', (event.pageY - 28) + 'px')
}

function stationTooltipHtml(s) {
    const values = measure === 'rain' ? s.prcp : s.snow
    const what = measure === 'rain' ? 'Rain' : 'New snow'
    const today = values[currentDay]
    const shortDate = d3.timeFormat('%b %-d')

    let total = 0
    let reported = 0
    for (let i = rangeStart; i <= currentDay; i++) {
        if (values[i] !== null) {
            total += values[i]
            reported++
        }
    }
    const days = currentDay - rangeStart + 1

    let html = `<strong>${s.name}, ${s.state}</strong><br/>
        <span class="tip-hint">Elevation ${Math.round(s.elevation)} m</span><br/>
        ${formatDate(allDates[currentDay])}<br/>
        ${what}: <strong>${today === null ? 'no reading' : today.toFixed(2) + ' in'}</strong><br/>
        Total since ${shortDate(allDates[rangeStart])}: <strong>${total.toFixed(2)} in</strong>
        <span class="tip-hint">(${reported} of ${days} days reported)</span><br/>`

    if (measure === 'snow' && s.snwd[currentDay] !== null) {
        html += `Snow on the ground: ${s.snwd[currentDay]} in<br/>`
    }
    if (s.gust[currentDay] !== null) {
        html += `Fastest gust: ${s.gust[currentDay]} mph<br/>`
    }
    return html
}

// ---------- Zoom ----------

function zoomed(event) {
    zoomScale = event.transform.k
    mapLayer.attr('transform', event.transform)

    stationLayer.selectAll('.station')
        .attr('r', d => dotSize(d))
}

// Generated with AI (Claude): zooming to a storm's box.
function zoomToStorm(storm) {
    insetLayer.select('.inset-box').classed('highlight', storm.usesInset === true)

    if (storm.zoomBox === null) {
        resetZoom(false)
        return
    }

    // path.bounds gives the box's size on screen. (Projecting the corners fails because
    // geoAlbersUsa returns null out in the ocean.) Corners must go clockwise.
    const [[west, south], [east, north]] = storm.zoomBox
    const box = {
        type: 'Polygon',
        coordinates: [[[west, south], [west, north], [east, north], [east, south], [west, south]]]
    }
    const [[x0, y0], [x1, y1]] = path.bounds(box)

    // scale so the box fills 90% of the map, then center on it
    const k = Math.min(12, 0.9 / Math.max((x1 - x0) / mapWidth, (y1 - y0) / mapHeight))
    const transform = d3.zoomIdentity
        .translate(mapWidth / 2, mapHeight / 2)
        .scale(k)
        .translate(-(x0 + x1) / 2, -(y0 + y1) / 2)

    mapSvg.transition()
        .duration(1000)
        .call(zoom.transform, transform)
}

// clearInset = false keeps the inset highlight (used by Maria)
function resetZoom(clearInset) {
    if (clearInset !== false) {
        insetLayer.select('.inset-box').classed('highlight', false)
    }
    mapSvg.transition()
        .duration(750)
        .call(zoom.transform, d3.zoomIdentity)
}

// ---------- Legend ----------

function updateLegend() {
    const breaks = measure === 'rain' ? rainBreaks : snowBreaks
    const colors = measure === 'rain' ? rainColors : snowColors

    const items = [{ label: 'No reading', hollow: true }, { label: '0', color: colors[0] }]
    breaks.forEach((b, i) => {
        const isLast = i === breaks.length - 1
        items.push({
            label: isLast ? b + '+' : String(b),
            color: colors[i + 1],
            extreme: measure === 'rain' && b >= rainRingAt
        })
    })

    const swatchWidth = 52
    const startX = 40

    legendSvg.selectAll('*').remove()

    legendSvg.append('text')
        .attr('class', 'legend-title')
        .attr('x', startX)
        .attr('y', 14)
        .text(legendTitle())

    const item = legendSvg.selectAll('.legend-item')
        .data(items)
        .join('g')
        .attr('class', 'legend-item')
        .attr('transform', (d, i) => `translate(${startX + i * swatchWidth}, 22)`)

    item.filter(d => d.hollow)
        .append('circle')
        .attr('class', 'station no-reading')
        .attr('cx', swatchWidth / 2 - 1)
        .attr('cy', 7)
        .attr('r', dotRadius + 1.5)

    item.filter(d => !d.hollow)
        .append('rect')
        .attr('width', swatchWidth - 2)
        .attr('height', 14)
        .attr('rx', 2)
        .style('fill', d => d.color)
        .classed('extreme', d => d.extreme)

    item.append('text')
        .attr('class', 'legend-label')
        .attr('x', swatchWidth / 2 - 1)
        .attr('y', 30)
        .attr('text-anchor', 'middle')
        .text(d => d.label)
}

function legendTitle() {
    const what = measure === 'rain' ? 'Rain' : 'New snowfall'
    if (mode === 'daily') {
        return `${what} on the selected day (inches)`
    }
    return `${what}, running total from ${formatDate(allDates[rangeStart])} (inches)`
}

window.addEventListener('load', init);
