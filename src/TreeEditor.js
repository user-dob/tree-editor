const uniqId = (() => {
	let id = 0;
	return () => ++id;
})();

const defaultOptions = {
	width: 1000,
	height: 600,
	margin: {top: 30, right: 10, bottom: 10, left: 10},
	steps: 20,
	legend: [],
	children: []
};

export class TreeEditor {
	constructor(el, options = {}) {
		this.options = this.processOptions(options);

		this.svg = d3.select(el).append('svg')
			.attr('width', this.options.outerWidth)
			.attr('height', this.options.outerHeight);

		this.tree = d3.tree()
			.size([this.options.height, this.options.width]);

		this.axis();
		this.legend();

		this.view =	this.svg.append('g')
			.attr('transform', `translate(${this.options.margin.left},${this.options.margin.top})`);

		this.dragLine = this.view.append('path')
			.attr('class', 'dragline hidden')
			.attr('d', 'M0,0L0,0');

		this.root = null;
		this.trees = [];
		this.selectedNode = null;
		this.selectedLink = null;


		this.svg
			.on('mousemove', this.bind(this.onSvgMouseMove))
			.on('mouseup', this.bind(this.onSvgMouseUp));

		d3.select(window)
			.on('keydown', this.bind(this.onSvgKeyDown));
	}

	processOptions(options) {
		options = Object.assign(defaultOptions, options);

		return Object.assign(options, {
			outerWidth: options.width,
			outerHeight: options.height,
			width: options.width - (options.margin.left + options.margin.right),
			height: options.height - (options.margin.top + options.margin.bottom)
		});
	}

	axis() {
		const { width, height, margin, steps } = this.options;

		this.x = d3.scaleLinear()
			.domain([0, steps])
			.range([0, width]);

		this.y = d3.scaleLinear()
			.domain([0, height])
			.range([0, height]);

		this.xAxis = d3.axisTop()
			.ticks(steps)
			.tickPadding(10)
			.tickSize(-height)
			.scale(this.x);

		this.yAxis = d3.axisLeft()
			.tickSize(0)
			.tickValues([])
			.scale(this.y);

		this.gX = this.svg.append('g')
			.attr('class', 'x axis')
			.attr('transform', `translate(${margin.left},${margin.top})`)
			.call(this.xAxis);

		this.gY = this.svg.append('g')
			.attr('class', 'y axis')
			.attr('transform', `translate(${margin.left},${margin.top})`)
			.call(this.yAxis);

		this.deltaZoom = 0;
		this.transformX = 0;
		this.transformY = 0;

		const zoom = d3.zoom()
			.scaleExtent([1, 1])
			.translateExtent([[0, -Infinity], [Infinity, Infinity]])
			.filter(this.bind(() => {
				return d3.event.target === this.svg.node();
			}))
			.on('zoom', this.bind(this.onZoom));

		this.svg.call(zoom);
	}

	onSvgMouseMove() {
		if (this.selectedNode && d3.event.which === 1) {
			const [node] = this.selectedNode.data();

			this.dragLine
				.attr('d', this.diagonal(node, {x0: this.invertX(d3.event.offsetX), y0: this.invertY(d3.event.offsetY)}));
		}
	}

	onSvgMouseUp() {
		this.dragLine
			.classed('hidden', true);
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

	onZoom() {
		const { margin } = this.options;

		const transform = d3.event.transform;
		const step = Math.round(this.x.invert(transform.x));
		this.deltaZoom = transform.x - this.x(step);
		this.transformX = transform.x;
		this.transformY = transform.y;

		this.gX.call(this.xAxis.scale(transform.rescaleX(this.x)));
		this.gY.call(this.yAxis.scale(transform.rescaleY(this.y)));
		this.view.attr('transform', transform.translate(margin.left, margin.top));
	}

	invertX(x) {
		return x - this.options.margin.left - this.transformX;
	}

	invertY(y) {
		return y - this.options.margin.top - this.transformY;
	}

	onDragLegendStart(el) {
		const step = Math.round(this.x.invert(d3.event.x));
		const x = this.x(step);

		this.dragLegend = d3.select(el).clone(true)
			.attr('transform', `translate(${x},${d3.event.y})`);

		this.svg.node().appendChild(this.dragLegend.node());
	}

	onDragLegendDrag(el) {
		const step = Math.round(this.x.invert(d3.event.x));
		const x = this.x(step) + this.options.margin.left + this.deltaZoom;

		this.dragLegend
			.attr('transform', `translate(${x},${d3.event.y})`);
	}

	onDragLegendEnd(el) {
		const [legend] = this.dragLegend.data();
		const transform = this.getTranslation(this.dragLegend.attr('transform'));
		const dragLegendX = this.invertX(transform.x);
		const dragLegendY = this.invertY(transform.y);

		const nodeEl = this.view.selectAll('g.node').select(this.bind(e => {
			const {x, y} = this.getTranslation(e.getAttribute('transform'));
			return Math.pow((dragLegendX - x), 2) + Math.pow((dragLegendY - y), 2) < 100 ? e : null
		}));

		if (nodeEl.node()) {
			const [node] = nodeEl.data();
			node.data.type = legend.type;
		} else {
			const data = {type: legend.type};
			const tree = d3.hierarchy(data);
			data.id = this.uniqId;
			tree.x0 = dragLegendX;
			tree.y0 = dragLegendY;
			tree.depth = Math.round(this.x.invert(dragLegendX)) - 1;

			this.trees.push(tree);
		}

		this.dragLegend.remove();
		this.draw();
	}

	legend() {
		this.dragLegend = null;
		this._legendMap = this.options.legend.reduce((map, item) => {
			map[item.type] = item;
			return map;
		}, {});

		const legend = this.svg
			.append('g')
			.attr('transform', `translate(50, 50)`)
			.selectAll('g.legend')
			.data(this.options.legend);

		const drag = d3.drag()
			.container(this.svg.node())
			.on('start', this.bind(this.onDragLegendStart))
			.on('drag', this.bind(this.onDragLegendDrag))
			.on('end', this.bind(this.onDragLegendEnd));

		const legendEnter = legend.enter()
			.append('g')
			.attr('class', 'legend')
			.attr('transform', (d, index, legend) => {
				const prevLegend = this.options.legend[index - 1];
				const offset = prevLegend ? 8 * prevLegend.label.length + 40 : 0;
				return `translate(${offset},0)`;
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
					.attr('class', 'short-label')
					.append('tspan')
					.text(d => d.shortLabel || '');
			})
			.call(g => {
				return g
					.append('text')
					.attr('class', 'label')
					.append('tspan')
					.attr('x', 15)
					.text(d => d.label);
			})
			.call(drag);
	}

	getLegendProperty(type, propertyName, defaultValue = '') {
		const legend = this._legendMap[type];
		if (legend) {
			return legend[propertyName] || defaultValue;
		}
		return defaultValue;
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

	setData(data) {
		data = d3.hierarchy(data, d => d.children);
		data = this.tree(data);
		data.id = data.id || uniqId();
		this.root = data;
		this.trees = [data];

		this.draw();
	}

	getData() {
		const copy = (node, data) => {
			data.type = node.data.type;
			if (Array.isArray(node.children)) {
				data.children = [];
				node.children.forEach((item, i) => {
					data.children[i] = {};
					copy(item, data.children[i]);
				});
			}
			return data;
		}

		return copy(this.root, {});
	}

	diagonal(s, d) {
		return `M ${s.x0} ${s.y0}
				C ${(s.x0 + d.x0) / 2} ${s.y0},
				  ${(s.x0 + d.x0) / 2} ${d.y0},
				  ${d.x0} ${d.y0}`;
	}

	draw() {
		const tree = this.view.selectAll('g.tree')
			.data(this.trees, d => d.id);

		const treeEnter = tree.enter()
			.append('g')
			.attr('class', 'tree');

		const treeUpdate = treeEnter.merge(tree);

		treeUpdate
			.each(this.bind((el, d) => this.drawTree(d3.select(el), d)));

		const treeExit = tree.exit()
			.remove();
	}

	drawTree(g, data) {
		const nodes = data.descendants().map(d => Object.assign(d, {
			id: d.id || uniqId(),
			x0: d.x0 || this.x(d.depth),
			y0: d.y0 || d.x
		}));

		const links = data.descendants().slice(1);

		this.drawNodes(g, nodes);
		this.drawLinks(g, links);
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
				if (Array.isArray(parent.children) && parent.children.length >= this.options.children.length) {
					return
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

	createNode(g) {
		return g
			.attr('class', 'node')
			.attr('transform', d => `translate(${d.x0},${d.y0})`)
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
					.append('tspan')
					.on('mousedown', this.bind(el => d3.select(el.closest('g').querySelector('circle')).dispatch('mousedown')))
					.on('mouseup', this.bind(el => d3.select(el.closest('g').querySelector('circle')).dispatch('mouseup')));
			});
	}

	drawNodes(g, nodes) {
		const node = g.selectAll('g.node')
			.data(nodes, d => d.id);

		const nodeEnter = node.enter()
			.append('g')
			.call(g => this.createNode(g));

		const nodeUpdate = nodeEnter.merge(node);

		nodeUpdate
			.select('circle')
			.style('fill', d => this.getLegendProperty(d.data.type, 'color', 'white'));

		nodeUpdate
			.select('tspan')
			.text(d => this.getLegendProperty(d.data.type, 'shortLabel'));

		const nodeExit = node.exit()
			.remove();
	}

	onLinkMouseDown(el) {
		this.resetMouse();
		this.selectedLink = d3.select(el);
		this.selectedLink.classed('selected', true);
	}

	createLink(g) {
		return g
			.attr('class', 'link')
			.attr('transform', d => `translate(${d.x0},${d.y0})`)
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
					.text(d => {
						const index = d.parent.children.indexOf(d);
						const options = this.options.children[index];
						return options && options.label ? options.label: '';
					})
					.on('mousedown', this.bind(el => d3.select(el.closest('g').querySelector('path')).dispatch('mousedown')));
			});
	}

	drawLinks(g, links) {
		const link = g.selectAll('g.link')
			.data(links, d => d.id);

		const linkEnter = link.enter()
			.insert('g', 'g')
			.call(g => this.createLink(g));

		const linkUpdate = linkEnter.merge(link);

		linkUpdate.select('path')
			.attr('d', d => this.diagonal({x0: d.parent.x0 - d.x0, y0: d.parent.y0 - d.y0}, {x0: 0, y0: 0}));

		const linkExit = link.exit()
			.remove();
	}

	bind(event) {
		const _this = this;
		return function (...args) {
			return event.apply(_this, [this, ...args]);
		}
	}

	getTranslation(transform) {
		const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		g.setAttributeNS(null, 'transform', transform);
		const matrix = g.transform.baseVal.consolidate().matrix;
		return {
			x: matrix.e,
			y: matrix.f
		};
	}
}
