import React, { Component } from 'react';
import * as d3 from 'd3';

class StreamGraph extends Component {
  constructor(props) {
    super(props);
    this.state = {
      data: null,
      isFileUploaded: false,
      tooltipData: null,
      tooltipPosition: { x: 0, y: 0 }
    };
    this.svgRef = React.createRef();
    this.tooltipRef = React.createRef();
    this.legendRef = React.createRef();
    this.containerRef = React.createRef();
  }

  componentDidMount() {
    document.addEventListener('mousemove', this.handleMouseMove);
  }

  componentWillUnmount() {
    document.removeEventListener('mousemove', this.handleMouseMove);
  }

  handleMouseMove = (event) => {
    // Only update tooltip position if tooltip is visible
    if (this.state.tooltipData) {
      this.setState({
        tooltipPosition: { x: event.pageX, y: event.pageY }
      }, () => this.updateTooltipPosition());
    }
  }

  updateTooltipPosition() {
    if (!this.tooltipRef.current || !this.state.tooltipData) return;
    
    const tooltip = this.tooltipRef.current;
    const x = this.state.tooltipPosition.x;
    const y = this.state.tooltipPosition.y;
    
    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipWidth = tooltipRect.width;
    const tooltipHeight = tooltipRect.height;
    
    // Calculate position to avoid going off-screen
    let finalX = x + 15;
    let finalY = y + 15;
    
    // Adjust if too close to right edge
    if (finalX + tooltipWidth > window.innerWidth) {
      finalX = x - tooltipWidth - 15;
    }
    
    // Adjust if too close to bottom edge
    if (finalY + tooltipHeight > window.innerHeight) {
      finalY = y - tooltipHeight - 15;
    }
    
    tooltip.style.left = `${finalX}px`;
    tooltip.style.top = `${finalY}px`;
    tooltip.style.display = 'block';
  }

  componentDidUpdate(prevProps, prevState) {
    // If the data state has changed, update the streamgraph
    if (prevState.data !== this.state.data && this.state.data) {
      this.renderStreamGraph();
    }
    
    // If tooltip data changed and now exists, update the tooltip
    if ((!prevState.tooltipData && this.state.tooltipData) || 
        (prevState.tooltipData && this.state.tooltipData && 
         prevState.tooltipData.model !== this.state.tooltipData.model)) {
      this.renderTooltip();
    }
  }

  handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvText = e.target.result;
        const parsedData = this.parseCSV(csvText);
        this.setState({ data: parsedData, isFileUploaded: true });
      };
      reader.readAsText(file);
    }
  };

  parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');
    const models = headers.slice(1); // Exclude the date column
    
    const parsedData = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const date = values[0];
      
      for (let j = 1; j < values.length; j++) {
        parsedData.push({
          date: date,
          model: headers[j],
          value: parseInt(values[j])
        });
      }
    }
    return parsedData;
  }

  renderStreamGraph() {
    // Clear any existing elements
    d3.select(this.svgRef.current).selectAll("*").remove();
    d3.select(this.legendRef.current).selectAll("*").remove();

    const data = this.state.data;
    if (!data || data.length === 0) return;

    // Dimensions
    const width = 800;
    const height = 500;
    const margin = { top: 20, right: 20, bottom: 30, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Get unique dates and models
    const dates = [...new Set(data.map(d => d.date))];
    const models = [...new Set(data.map(d => d.model))];
    
    // Custom color scheme matching the image
    const colorMap = {
      'LLaMA-3.1': '#ff7f00', // Orange
      'Claude': '#984ea3',    // Purple
      'PaLM-2': '#4daf4a',    // Green
      'Gemini': '#377eb8',    // Blue
      'GPT-4': '#e41a1c'      // Red
    };
    
    // Create color scale using custom colors or fallback to default colors
    const colorScale = d => colorMap[d] || d3.schemeCategory10[models.indexOf(d) % 10];

    // Format data for stream graph
    const formattedData = dates.map(date => {
      const obj = { date };
      models.forEach(model => {
        const item = data.find(d => d.date === date && d.model === model);
        obj[model] = item ? item.value : 0;
      });
      return obj;
    });

    // Create SVG
    const svg = d3.select(this.svgRef.current)
      .attr("width", width)
      .attr("height", height);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create x scale
    const xScale = d3.scalePoint()
      .domain(dates)
      .range([0, innerWidth]);

    // Stack the data - ensure order matches the image (bottom to top: red, blue, green, purple, orange)
    const desiredOrder = ['GPT-4', 'Gemini', 'PaLM-2', 'Claude', 'LLaMA-3.1'];
    const orderedModels = models.sort((a, b) => {
      const indexA = desiredOrder.indexOf(a);
      const indexB = desiredOrder.indexOf(b);
      return indexA - indexB;
    });
    
    const stack = d3.stack()
      .keys(orderedModels)
      .offset(d3.stackOffsetWiggle)
      .order(d3.stackOrderNone); // Use explicit order instead of inside-out

    const stackedData = stack(formattedData);

    // Create y scale
    const yScale = d3.scaleLinear()
      .domain([
        d3.min(stackedData, layer => d3.min(layer, d => d[0])),
        d3.max(stackedData, layer => d3.max(layer, d => d[1]))
      ])
      .range([innerHeight, 0]);

    // Create area generator
    const area = d3.area()
      .x((d, i) => xScale(formattedData[i].date))
      .y0(d => yScale(d[0]))
      .y1(d => yScale(d[1]))
      .curve(d3.curveBasis);

    // Draw stream paths
    g.selectAll(".stream")
      .data(stackedData)
      .enter()
      .append("path")
      .attr("class", "stream")
      .attr("d", area)
      .attr("fill", d => colorScale(d.key))
      .attr("opacity", 0.9)
      .on("mouseenter", (event, d) => {
        const model = d.key;
        const [mouseX, mouseY] = d3.pointer(event);
        
        // Find closest date point to mouse position
        let closestDateIndex = Math.round((mouseX / innerWidth) * (dates.length - 1));
        closestDateIndex = Math.max(0, Math.min(closestDateIndex, dates.length - 1));
        
        const tooltipData = {
          model,
          values: dates.map((date, i) => ({
            date,
            value: formattedData[i][model]
          })),
          currentDate: dates[closestDateIndex]
        };

        this.setState({
          tooltipData,
          tooltipPosition: { 
            x: event.pageX, 
            y: event.pageY 
          }
        });
      })
      .on("mouseleave", () => {
        this.setState({ tooltipData: null });
        if (this.tooltipRef.current) {
          this.tooltipRef.current.style.display = 'none';
        }
      });

    // Add x-axis
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale));

    // Legend
    const legendSvg = d3.select(this.legendRef.current)
      .attr("width", 200)
      .attr("height", models.length * 30);

    // Use the same order as in the streamgraph for the legend
    const legendItems = legendSvg.selectAll(".legend")
      .data(desiredOrder.filter(m => models.includes(m)))
      .enter()
      .append("g")
      .attr("class", "legend")
      .attr("transform", (d, i) => `translate(0,${i * 30})`);

    legendItems.append("rect")
      .attr("width", 20)
      .attr("height", 20)
      .attr("fill", d => colorScale(d));

    legendItems.append("text")
      .attr("x", 30)
      .attr("y", 15)
      .text(d => d);
  }

  renderTooltip() {
    const tooltipDiv = d3.select(this.tooltipRef.current);
    tooltipDiv.selectAll("*").remove();
    
    if (!this.state.tooltipData) {
      tooltipDiv.style("display", "none");
      return;
    }
    
    const tooltipData = this.state.tooltipData;
    const model = tooltipData.model;
    const values = tooltipData.values;
    
    // Tooltip dimensions
    const width = 200;
    const height = 150;
    const margin = { top: 20, right: 10, bottom: 30, left: 40 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Custom color scheme matching the image
    const colorMap = {
      'LLaMA-3.1': '#FF6C00', // Orange
      'Claude': '#9B4FB2',    // Purple
      'PaLM-2': '#4CAF50',    // Green
      'Gemini': '#2196F3',    // Blue
      'GPT-4': '#F44336'      // Red
    };
    
    // Get color for the current model
    const modelColor = colorMap[model] || d3.schemeCategory10[[...new Set(this.state.data.map(d => d.model))].indexOf(model) % 10];
    
    // Create SVG
    const svg = tooltipDiv.append("svg")
      .attr("width", width)
      .attr("height", height);
    
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
    
    // Create scales
    const xScale = d3.scaleBand()
      .domain(values.map(d => d.date))
      .range([0, innerWidth])
      .padding(0.2);
    
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(values, d => d.value)])
      .range([innerHeight, 0]);
    
    // Draw bars
    g.selectAll(".bar")
      .data(values)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", d => xScale(d.date))
      .attr("y", d => yScale(d.value))
      .attr("width", xScale.bandwidth())
      .attr("height", d => innerHeight - yScale(d.value))
      .attr("fill", modelColor);
    
    // Add x-axis
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end")
      .style("font-size", "8px");
    
    // Add y-axis
    g.append("g")
      .call(d3.axisLeft(yScale));
    
    // Add title
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", -5)
      .attr("text-anchor", "middle")
      .text(`${model} Usage`);

    // Set initial tooltip position
    this.updateTooltipPosition();
  }

  render() {
    return (
      <div ref={this.containerRef}>
        <h2>LLM Hashtag Usage Over Time</h2>
        
        <div>
          <label>Upload CSV File:</label>
          <input 
            type="file" 
            accept=".csv" 
            onChange={this.handleFileUpload}
          />
        </div>
        
        {this.state.isFileUploaded && (
          <div>
            <div>
              <svg ref={this.svgRef}></svg>
            </div>
            <div className="ml-4">
              <svg ref={this.legendRef}></svg>
            </div>
          </div>
        )}
        
        <div 
          ref={this.tooltipRef} 
          style={{ 
            display: 'none',
            pointerEvents: 'none',
            position: 'absolute',
            zIndex: 1000
          }}
        />
      </div>
    );
  }
}

export default function App() {
  return (
    <div>
      <div>
        <StreamGraph />
      </div>
    </div>
  );
}