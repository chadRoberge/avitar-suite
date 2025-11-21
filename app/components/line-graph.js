import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import * as d3 from 'd3';

export default class LineGraphComponent extends Component {
  @tracked svg = null;

  @action
  drawGraph(container) {
    // Clear any existing SVG first
    d3.select(container).select('svg').remove();
    if (!container || !this.args.data?.length) return;

    const data = this.args.data || [];
    const xField = this.args.xField || 'x';
    const yField = this.args.yField || 'y';
    const xLabel = this.args.xLabel || 'X Axis';
    const yLabel = this.args.yLabel || 'Y Axis';
    const yFormatFunc = this.args.yFormatFunction;
    const lineColor = this.args.lineColor || '#10b981';

    if (!data.length) return;

    // Filter out invalid data points (missing or non-numeric values)
    const validData = data.filter((d) => {
      const xValue = Number(d[xField]);
      const yValue = Number(d[yField]);
      return (
        !isNaN(xValue) &&
        !isNaN(yValue) &&
        isFinite(xValue) &&
        isFinite(yValue) &&
        d[xField] != null &&
        d[yField] != null
      );
    });

    // If no valid data points, don't render graph
    if (!validData.length) {
      console.warn('LineGraph: No valid data points to render');
      return;
    }

    // Get container dimensions and make graph responsive
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;

    // Use available width with padding, minimum 300px
    const actualWidth = Math.max(300, containerWidth - 40); // 40px for padding

    // Set dimensions and margins
    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const width = actualWidth - margin.left - margin.right;
    // Auto height based on width (maintain aspect ratio, minimum 200px)
    const height = Math.max(200, width * 0.6);

    // Sort data by x field (ensuring numeric comparison)
    const sortedData = [...validData].sort((a, b) => Number(a[xField]) - Number(b[xField]));

    // Create scales (explicitly convert to numbers to ensure valid domains)
    const xScale = d3
      .scaleLinear()
      .domain(d3.extent(sortedData, (d) => Number(d[xField])))
      .range([0, width]);

    const yScale = d3
      .scaleLinear()
      .domain(d3.extent(sortedData, (d) => Number(d[yField])))
      .range([height, 0]);

    // Create SVG
    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .attr('class', 'line-graph');

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add grid lines
    const xTicks = 5;
    const yTicks = 5;

    // Vertical grid lines
    g.selectAll('.grid-line-vertical')
      .data(xScale.ticks(xTicks))
      .enter()
      .append('line')
      .attr('class', 'grid-line-vertical')
      .attr('x1', (d) => xScale(d))
      .attr('x2', (d) => xScale(d))
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 1);

    // Horizontal grid lines
    g.selectAll('.grid-line-horizontal')
      .data(yScale.ticks(yTicks))
      .enter()
      .append('line')
      .attr('class', 'grid-line-horizontal')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 1);

    // Create line generator (explicitly convert to numbers)
    const line = d3
      .line()
      .x((d) => xScale(Number(d[xField])))
      .y((d) => yScale(Number(d[yField])))
      .curve(d3.curveMonotoneX);

    // Add the line
    g.append('path')
      .datum(sortedData)
      .attr('class', 'value-line')
      .attr('fill', 'none')
      .attr('stroke', lineColor)
      .attr('stroke-width', 3)
      .attr('d', line);

    // Add data points (explicitly convert to numbers)
    g.selectAll('.data-point')
      .data(sortedData)
      .enter()
      .append('circle')
      .attr('class', 'data-point')
      .attr('cx', (d) => xScale(Number(d[xField])))
      .attr('cy', (d) => yScale(Number(d[yField])))
      .attr('r', 4)
      .attr('fill', lineColor);

    // Add X axis
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(xTicks))
      .selectAll('text')
      .style('font-size', '10px')
      .style('fill', '#6b7280');

    // Add Y axis with optional formatting function
    const yAxis = d3.axisLeft(yScale).ticks(yTicks);
    if (yFormatFunc) {
      yAxis.tickFormat(yFormatFunc);
    }

    g.append('g')
      .attr('class', 'y-axis')
      .call(yAxis)
      .selectAll('text')
      .style('font-size', '10px')
      .style('fill', '#6b7280');

    // Style axes
    g.selectAll('.x-axis path, .y-axis path')
      .style('stroke', '#374151')
      .style('stroke-width', '2px');

    g.selectAll('.x-axis .tick line, .y-axis .tick line').style(
      'stroke',
      '#6b7280',
    );

    // Add axis labels
    g.append('text')
      .attr('class', 'x-label')
      .attr('text-anchor', 'middle')
      .attr('x', width / 2)
      .attr('y', height + 35)
      .style('font-size', '12px')
      .style('fill', '#374151')
      .text(xLabel);

    g.append('text')
      .attr('class', 'y-label')
      .attr('text-anchor', 'middle')
      .attr('transform', 'rotate(-90)')
      .attr('y', -45)
      .attr('x', -height / 2)
      .style('font-size', '12px')
      .style('fill', '#374151')
      .text(yLabel);

    this.svg = svg;
  }
}
