const defaultOptions = {
	width: 1000,
	height: 600,
	steps: 20,
	margin: {top: 10, right: 20, bottom: 10, left: 20},
	duration: 750,
	legend: []
};

export class TreeEditor {
	constructor(root, options = {}) {
		this.options = Object.assign(defaultOptions, options);

		const { width, height, margin } = this.options;

		this.scale = d3.scaleLinear()
			.domain([1, this.options.steps])
			.range([0, this.options.width]);

		this.svg = d3.select(root)
			.append('svg')
			.attr('width', width + margin.left + margin.right)
			.attr('height', height + margin.top + margin.bottom);

		this.g = this.svg
			.append('g')
			.attr('transform', `translate(${margin.left}, ${margin.top})`)
			.call(g => this.xAxis(g));

		this.tree = d3.tree()
			.size([height, width]);

		this.dragLine = this.g.append('path')
			.attr('class', 'dragline hidden')
			.attr('d', 'M0,0L0,0');

		this.root = null;
		this.trees = [];
		this.selectedNode = null;
		this.selectedLink = null;
		this.dragLegend = null;

		this.createLegend();

		this.svg
			.on('mousemove', this.bind(this.onSvgMouseMove))
			.on('mouseup', this.bind(this.onSvgMouseUp));

		d3.select(window)
			.on('keydown', this.bind(this.onSvgKeyDown));
	}

	bind(event) {
		const _this = this;
		return function (...args) {
			return event.apply(_this, [this, ...args]);
		}
	}

	xAxis(g) {
		const xAxis = d3.axisBottom()
			.ticks(this.options.steps)
			.tickSize(0)
			.scale(this.scale);

		return g
			.call(xAxis)
			.call(g => g.select('.domain').remove())
			.call(g => {
				return g.selectAll('.tick line')
					.attr('y1', 20)
					.attr('y2', this.options.height)
					.attr('stroke', '#ddd')
					.style('opacity', 0.8);
			});
	}

	onDragLegendStart(el) {
		this.dragLegend = d3.select(el).clone(true)
			.attr('transform', `translate(0,30)`);

		this.g.node().appendChild(this.dragLegend.node());
	}

	onDragLegendDrag(el) {
		const step = Math.round(this.scale.invert(d3.event.x));
		const x = this.scale(step);

		this.dragLegend
			.attr('transform', `translate(${x},${d3.event.y + 30})`);
	}

	onDragLegendEnd(el) {
		this.dragLegend.remove();
	}

	createLegend() {
		const legend = this.g
			.append('g')
			.attr('transform', `translate(0, 30)`)
			.selectAll('g.legend')
			.data(this.options.legend);

		const drag = d3.drag()
			.on('start', this.bind(this.onDragLegendStart))
			.on('drag', this.bind(this.onDragLegendDrag))
			.on('end', this.bind(this.onDragLegendEnd));

		const legendEnter = legend.enter()
			.append('g')
			.attr('class', 'legend')
			.attr('transform', (d, index, legend) => {
				const prevLegend = this.options.legend[index - 1];
				const offset = prevLegend ? 8 * prevLegend.label.length + 10 : 0;
				return `translate(${offset},0)`;
			})
			.call(g => {
				return g
					.append('circle')
					.attr('r', 10)
					.style('fill', d => d.color);
			})
			.call(g => {
				return g
					.append('text')
					.attr('x', 15)
					.attr('y', 5)
					.text(d => d.label);
			})
			.call(drag);
	}

	setData(data) {
		data = d3.hierarchy(data, d => d.children);
		data = this.tree(data);
		data.id = data.id || this.uniqId;
		this.root = data;
		this.trees = [data];

		this.draw();
	}

	get uniqId() {
		if (!this._id) {
			this._id = 1;
		}
		return ++this._id;
	}

	diagonal(s, d) {
		return `M ${s.y} ${s.x}
				C ${(s.y + d.y) / 2} ${s.x},
				  ${(s.y + d.y) / 2} ${d.x},
				  ${d.y} ${d.x}`;
	}

	resetMouse() {
		if (this.selectedNode) {
			this.selectedNode.classed('selected', false);
			this.selectedNode = null;
		}

		if (this.selectedLink) {
			this.selectedLink.classed('selected', false);
			this.selectedLink = null;
		}
	}

	onNodeMouseDown(el) {
		this.resetMouse();
		this.selectedNode = d3.select(el);
		this.selectedNode.classed('selected', true);

		const [node] = this.selectedNode.data();

		this.dragLine
			.classed('hidden', false)
			.attr('d', this.diagonal(node, node));
	}

	onNodeMouseUp(el) {
		this.dragLine
			.classed('hidden', true);

		if (this.selectedNode) {
			let [parent] = this.selectedNode.data();
			let [children] = d3.select(el).data();

			if (parent.id !== children.id) {
				if (parent.depth > children.depth) {
					[parent, children] = [children, parent];
				}

				if (children.parent) {
					if (Array.isArray(children.parent.children)) {
						children.parent.children = children.parent.children.filter(item => item !== children);
						if (children.parent.children.length === 0) {
							children.parent.children = null;
						}
					}
				}

				parent.children = parent.children || [];
				parent.children.push(children);
				children.parent = parent;

				this.trees = this.trees.filter(item => item !== children);

				this.draw();
			}
		}
	}

	onSvgMouseMove() {
		if (this.selectedNode && d3.event.which === 1) {
			const { margin } = this.options;
			const [node] = this.selectedNode.data();

			if (d3.event.ctrlKey) {

			}

			this.dragLine
				.attr('d', this.diagonal(node, {x: d3.event.offsetY - margin.top, y: d3.event.offsetX - margin.left}));
		}
	}

	onSvgMouseUp() {
		this.dragLine
			.classed('hidden', true);
	}

	onLinkMouseDown(el) {
		this.resetMouse();
		this.selectedLink = d3.select(el);
		this.selectedLink.classed('selected', true);
	}

	onSvgKeyDown() {
		if (this.selectedNode || this.selectedLink) {
			switch (d3.event.keyCode) {
				case 46: // delete
					if (this.selectedNode) {
						let [node] = this.selectedNode.data();
						if (node.parent) {
							if (Array.isArray(node.parent.children)) {
								node.parent.children = node.parent.children.filter(item => item !== node);
								if (node.parent.children.length === 0) {
									node.parent.children = null;
								}
							}
						} else {
							this.trees = this.trees.filter(item => item !== node);
						}
						this.draw();
					}

					if (this.selectedLink) {
						const [node] = this.selectedLink.data();
						if (node.parent) {
							if (Array.isArray(node.parent.children)) {
								node.parent.children = node.parent.children.filter(item => item !== node);
								if (node.parent.children.length === 0) {
									node.parent.children = null;
								}
							}
							node.parent = null;
							this.trees.push(node);
							this.draw();
						}
					}

					break;
			}
		}
	}

	createNode(g) {
		return g
			.attr('class', 'node')
			.attr('transform', d => `translate(${d.y},${d.x})`)
			.call(g => {
				return g
					.append('circle')
					.attr('r', 10)
					.on('mousedown', this.bind(this.onNodeMouseDown))
					.on('mouseup', this.bind(this.onNodeMouseUp));
			})
			.call(g => {
				return g
					.append('text')
					.attr('x', 0)
					.attr('y', 4)
					.text(d => d.data.name)
					.on('mousedown', this.bind(el => d3.select(el.parentNode).select('circle').dispatch('mousedown')))
					.on('mouseup', this.bind(el => d3.select(el.parentNode).select('circle').dispatch('mouseup')));
			});
	}

	drawNodes(g, nodes) {
		nodes.forEach(d => d.y = this.scale(d.depth + 1));

		const node = g.selectAll('g.node')
			.data(nodes, d => d.id || (d.id = this.uniqId));

		const nodeEnter = node.enter()
			.append('g')
			.call(g => this.createNode(g));

		const nodeUpdate = nodeEnter.merge(node);

		nodeUpdate.transition()
			.duration(this.options.duration);

		const nodeExit = node.exit().transition()
			.duration(this.options.duration)
			.remove();
	}

	createLink(g) {
		return g
			.attr('class', 'link')
			.attr('transform', d => `translate(${d.y},${d.x})`)
			.call(g => {
				return g
					.append('path')
					.attr('id', d => `link-${d.id}`)
					.on('mousedown', this.bind(this.onLinkMouseDown));
			})
			.call(g => {
				return g
					.append('text')
					.append('textPath')
					.attr('xlink:href', d => `#link-${d.id}`)
					.attr('startOffset', '50%')
					.text(d => 'yes')
					.on('mousedown', this.bind(el => d3.select(el.parentNode.parentNode).select('path').dispatch('mousedown')));
			});
	}

	drawLinks(g, links) {
		const link = g.selectAll('g.link')
			.data(links, d => d.id);

		const linkEnter = link.enter()
			.insert('g', 'g')
			.call(g => this.createLink(g));

		const linkUpdate = linkEnter.merge(link);

		linkUpdate.transition()
			.duration(this.options.duration);

		linkUpdate.select('path')
			.attr('d', d => this.diagonal({x: d.parent.x - d.x, y: d.parent.y - d.y}, {x: 0, y: 0}));

		const linkExit = link.exit().transition()
			.duration(this.options.duration)
			.remove();
	}

	drawTree(g, data) {
		const nodes = data.descendants();
		const links = data.descendants().slice(1);

		this.drawNodes(g, nodes);
		this.drawLinks(g, links);
	}

	draw() {
		const tree = this.g.selectAll('g.tree')
			.data(this.trees, d => d.id);

		const treeEnter = tree.enter()
			.append('g')
			.attr('class', 'tree');

		const treeUpdate = treeEnter.merge(tree);

		treeUpdate.transition()
			.duration(this.options.duration)
			.each(this.bind((el, d) => this.drawTree(d3.select(el), d)));

		const treeExit = tree.exit().transition()
			.duration(this.options.duration)
			.remove();
	}
}





























