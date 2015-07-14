var Reflux = require('reflux'),
    request = require('superagent'),
    sortBy = require('lodash.sortby'),
    host = (process.env.NODE_ENV === 'development') ? 'http://localhost:3000/' : 'http://wrioos.com.s3-website-us-east-1.amazonaws.com/',
    CrossStorageClient = require('cross-storage').CrossStorageClient,
    Promise = (typeof Promise !== 'undefined') ? Promise : require('es6-promise').Promise,
    storage = new CrossStorageClient(host + 'Plus-WRIO-App/widget/storageHub.htm', {
        promise: Promise
    }),
    Actions = require('../actions/jsonld');

module.exports = Reflux.createStore({
    listenables: Actions,
    getUrl: function () {
        var theme = 'Default-WRIO-Theme';
        return host + theme + '/widget/defaultList.htm';
    },
    init: function () {
        storage.onConnect().then(function () {
            return storage.get('plus');
        }).then(function (res) {
            this.data = res || {};
            if (!this.haveData()) {
                this.getHttp(
                    this.getUrl(),
                    this.filterItemList
                );
            }
        }.bind(this));
    },
    data: {},
    pending: 0,
    onData: function (params) {
        var o = params.tab,
            name = params.parent;
        if (name) {
            if (this.data[name] === undefined) {
                this.data[name] = {
                    name: name,
                    url: o.author,
                    order: o.order
                };
            }
            if (this.data[name].children === undefined) {
                this.data[name].children = {};
            }
            this.data[name].children[o.name] = o;
        } else {
            if (o.author) {
                console.warn('plus: author [' + o.author + '] do not have type Article');
            }
            this.data[o.name] = o;
        }
        this.pending -= 1;
        if (this.pending === 0) {
            storage.onConnect().then(function () {
                return storage.get('plus');
            }).then(function (res) {
                if (JSON.stringify(res) !== JSON.stringify(this.data)) {
                    this.update();
                }
            }.bind(this));
        }
    },
    lastOrder: function (x) {
        var keys = Object.keys(x),
            max = (keys.length === 0) ? 0 : x[keys[0]].order,
            i;
        for (i = 1; i < keys.length; i += 1) {
            var order = x[keys[i]].order;
            if (order > max) {
                max = order;
            }
        }
        return max;
    },
    onDataActive: function (params) {
        var o = params.tab,
            name = params.parent;
        if (name) {
            if (this.data[name] === undefined) {
                this.data[name] = {
                    name: name,
                    url: o.author,
                    order: this.lastOrder(this.data) + 1
                };
            }
            if (this.data[name].children === undefined) {
                this.data[name].children = {};
            }
            var children = this.data[name].children;
            if (children[o.name]) {
                children[o.name].active = true;
            } else {
                children[o.name] = o;
                children[o.name].order = this.lastOrder(children);
            }
        } else {
            if (o.author) {
                console.warn('plus: author [' + o.author + '] do not have type Article');
            }
            if (this.data[o.name]) {
                this.data[o.name].active = true;
            } else {
                this.data[o.name] = o;
                this.data[o.name].order = this.lastOrder(this.data);
            }
        }
    },
    update: function (cb) {
        storage.onConnect()
            .then(function () {
                storage.del('plus');
                storage.set('plus', this.data);
            }.bind(this))
            .then(cb);
    },
    getHttp: function (url, cb) {
        var self = this;
        request.get(
            url,
            function (err, result) {
                if (!err && (typeof result === 'object')) {
                    var e = document.createElement('div');
                    e.innerHTML = result.text;
                    result = Array.prototype.filter.call(e.getElementsByTagName('script'), function (el) {
                        return el.type === 'application/ld+json';
                    }).map(function (el) {
                        var json;
                        try {
                            json = JSON.parse(el.textContent);
                        } catch (exception) {
                            console.error('Requested json-ld from ' + url + ' not valid: ' + exception);
                        }
                        return json;
                    }).filter(function (json) {
                        return typeof json === 'object';
                    });
                }
                cb.call(self, result || []);
            }
        );
    },
    merge: function () {
        this.removeLastActive(this.data);
        this.addCurrentPage(function (params) {
            if (params) {
                this.onDataActive(params);
            }
            this.update();
            this.trigger(this.data);
        });
    },
    removeLastActive: function (obj) {
        Object.keys(obj).forEach(function (key) {
            var o = obj[key];
            if (o.active !== undefined) {
                delete o.active;
            }
            if (o.children) {
                this.removeLastActive(o.children);
            }
        }, this);
    },
    addCurrentPage: function (cb) {
        var scripts = document.getElementsByTagName('script'),
            i,
            json,
            o;
        for (i = 0; i < scripts.length; i += 1) {
            if (scripts[i].type === 'application/ld+json') {
                json = undefined;
                try {
                    json = JSON.parse(scripts[i].textContent);
                } catch (exception) {
                    json = undefined;
                    console.error('Your json-ld not valid: ' + exception);
                }
                if ((typeof json === 'object') && (json['@type'] === 'Article')) {
                    o = {
                        name: json.name,
                        url: window.location.href,
                        author: json.author,
                        active: true
                    };
                    break;
                }
            }
        }
        if (o) {
            if (o.author) {
                this.getHttp(o.author, function (jsons) {
                    var j, name;
                    for (j = 0; j < jsons.length; j += 1) {
                        if (jsons[j]['@type'] === 'Article') {
                            name = jsons[j].name;
                            j = jsons.length;
                        }
                    }
                    cb.call(this, {
                        tab: o,
                        parent: name
                    });
                }.bind(this));
            } else {
                cb.call(this, {
                    tab: o
                });
            }
        } else {
            cb.call(this);
        }
    },
    filterItemList: function (jsons) {
        var items = [];
        jsons.forEach(function (json) {
            if ((json.itemListElement !== undefined) && (json['@type'] === 'ItemList')) {
                items = items.concat(json.itemListElement);
            }
        });
        this.pending += items.length;
        this.core(items);
    },
    core: function (items) {
        items.forEach(function (o, order) {
            o = {
                name: o.name,
                url: o.url,
                author: o.author,
                order: order
            };
            var author = o.author;
            if (author) {
                this.getHttp(author, function (jsons) {
                    var j, name;
                    for (j = 0; j < jsons.length; j += 1) {
                        if (jsons[j]['@type'] === 'Article') {
                            name = jsons[j].name;
                            j = jsons.length;
                        }
                    }
                    this.onData({
                        tab: o,
                        parent: name
                    });
                }.bind(this));
            } else {
                this.onData({
                    tab: o
                });
            }
        }, this);
    },
    getInitialState: function () {
        return this.data;
    },
    onDel: function (listName, elName) {
        var next;
        if (elName === undefined) {
            next = this.getNext(this.data, listName);
            delete this.data[listName];
        } else {
            next = this.getNext(this.data[listName].children, elName);
            delete this.data[listName].children[elName];
            if (Object.keys(this.data[listName].children).length === 0) {
                delete this.data[listName].children;
                this.data[listName].active = true;
            }
        }
        this.update(function () {
            if (next) {
                window.location = next;
            } else {
                this.trigger(this.data);
            }
        }.bind(this));
        
    },
    getNext: function (obj, key) {
        if (!obj[key].active) {
            return;
        }
        var children = sortBy(
            Object.keys(obj).map(function (name) {
                return obj[name];
            }),
            'order'
        ),
            i,
            child,
            next;
        for (i = 0; i < children.length; i += 1) {
            child = children[i];
            if (child.name === key) {
                break;
            }
        }
        next = children[i - 1] || children[i + 1];
        if (next) {
            return next.url;
        }
    },
    haveData: function () {
        return (this.data !== null) && (typeof this.data === 'object') && (Object.keys(this.data).length !== 0);
    },
    onRead: function () {
        if (this.haveData() && (this.pending === 0)) {
            this.merge();
        } else {
            var i = setInterval(function () {
                if (this.haveData() && (this.pending === 0)) {
                    clearInterval(i);
                    this.merge();
                }
            }.bind(this), 100);
        }
    }
});
