'use strict';
var React = require('react'),
    store = require('./stores/jsonld'),
    actions = require('./actions/jsonld'),
    Element = require('./Element'),
    classNames = require('classnames'),
    sortBy = require('lodash.sortby'),
    P = require('./P');

class Plus extends React.Component{
    constructor (props) {
        super(props);
        this.onStateChange = (jsonld) => {
            this.setState({jsonld: jsonld});
        };
    }
    componentDidMount() {
        this.unsubscribe = store.listen(this.onStateChange);
        actions.read();
    }
    componentWillUnmount() {
        this.unsubscribe();
    }
    render() {
        if (this.state === null) {
            return null;
        }
        return (
            <div className="navbar-collapse in unselectable" unselectable="on">
                <div className="navbar-header" id="leftMenuwrp">
                    <List data={this.state.jsonld} />
                </div>
            </div>
        );
    }
}


class SubList extends React.Component{
    gotoUrl () {
        window.location = '//' + this.props.data.url;
    }

    createElements () {
        var children = this.props.data.children;
        return sortBy(
            Object.keys(children).map(function (name) {
                return children[name];
            }),
            'order'
        ).map(function (i) {
            var list = this.props.data.url,
                del = function () {
                    actions.del(list, i.url);
                };
            if (i.active) {
                this.style.height = 'auto';
            }
            return <Element className="panel" del={del} data={i} key={i.url} />;
        }, this);
    }

    render() {

        this.style.height = this.props.data.active ? 'auto' : '0px';
        var data = this.props.data,
            name = data.name,
            lis = this.createElements(),
            rightContent = data.children ? Object.keys(data.children).length : <span onClick={this.del} className="glyphicon glyphicon-remove" />,
            className = classNames({
                panel: true,
                active: data.active,
                open: (data.children && (data.active || data.children.active))
            });
        return (
            <li className={className}>
                <a onClick={this.gotoUrl} className="collapsed" data-parent="#nav-accordion" data-toggle="collapse">
                    <span className="qty pull-right">{rightContent}</span>
                    <span>{name}</span>
                </a>
                <div className="in" style={this.style}>
                    <ul className="nav nav-pills nav-stacked sub">
                        {lis}
                    </ul>
                </div>
            </li>
        );
    }
}

SubList.propTypes = {
    data: React.PropTypes.object.isRequired
};

SubList.style = {
    overflow: 'hidden'
};

module.exports = Plus;
