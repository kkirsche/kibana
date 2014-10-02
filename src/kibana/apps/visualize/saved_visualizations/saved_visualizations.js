define(function (require) {
  var app = require('modules').get('app/visualize');
  var _ = require('lodash');

  require('apps/visualize/saved_visualizations/_saved_vis');

  // Register this service with the saved object registry so it can be
  // edited by the object editor.
  require('apps/settings/saved_object_registry').register({
    service: 'savedVisualizations',
    title: 'visualizations'
  });

  app.service('savedVisualizations', function (Promise, es, config, SavedVis, Private, Notifier, kbnUrl) {
    var visTypes = Private(require('components/vis_types/index'));
    var notify = new Notifier({
      location: 'saved visualization service'
    });

    this.get = function (id) {
      return (new SavedVis(id)).init();
    };

    this.urlFor = function (id) {
      return kbnUrl.eval('#/visualize/edit/{{id}}', {id: id});
    };

    this.delete = function (ids) {
      ids = !_.isArray(ids) ? [ids] : ids;
      return Promise.map(ids, function (id) {
        return (new SavedVis(id)).delete();
      });
    };

    this.find = function (searchString) {
      var self = this;
      var body = searchString ? {
          query: {
            simple_query_string: {
              query: searchString + '*',
              fields: ['title^3', 'description'],
              default_operator: 'AND'
            }
          }
        }: { query: {match_all: {}}};
      return es.search({
        index: config.file.kibanaIndex,
        type: 'visualization',
        body: body,
        size: 100,
      })
      .then(function (resp) {
        return {
          total: resp.hits.total,
          hits: _.transform(resp.hits.hits, function (hits, hit) {
            var source = hit._source;
            source.id = hit._id;
            source.url = self.urlFor(hit._id);

            var typeName = source.typeName;
            if (source.visState) {
              try { typeName = JSON.parse(source.visState).type; }
              catch (e) { /* missing typename handled below */ }
            }

            if (!typeName || !visTypes.byName[typeName]) {
              notify.info('unable to detect type from visualization source', hit);
              return;
            }

            source.type = visTypes.byName[typeName];
            source.icon = source.type.icon;
            hits.push(source);
          }, [])
        };
      });
    };
  });
});